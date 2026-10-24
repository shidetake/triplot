-- LLM を1回呼ぶたびに、かかった費用を1行ずつ記録する。
--
-- これまでの単価は「AI Gateway の累計使用額 ÷ 抽出した通数」だった。累計額は
-- チーム全体の値なので、本番と staging のどちらの DB から割っても両方の分が
-- 混ざる（staging の管理ページは本番の使用額まで staging の通数で割り、1通
-- $0.36 と出ていた。実際は約 $0.02）。モデルを変えれば途中から単価も変わるので、
-- 全期間の平均では足りない。AI Gateway は1回ごとの費用を応答に入れて返す
-- （providerMetadata.gateway.cost）ので、それをそのまま残す。
--
-- **メールの行には持たせず、表を分ける。**
--   ・寿命が違う。メールは90日の自動削除・テスト用の受信箱の掃除・アカウント
--     削除で消えるが、費用の履歴は残したい（ai_usage_daily を分けたのと同じ理由）。
--   ・1通で LLM を呼ぶ回数が決まっていない（抽出・リンク先を読んだ後の再抽出・
--     合体の判定）。1回 = 1行にすれば段階ごとの費用も合計も出せる。
--   ・読める人が違う。メールは本人だけ、費用は管理者が読めるべき
--     （docs/database.md「データを誰に読ませるか」）。
--
-- **何の処理の費用かは「機能」→「目的」→「処理の単位」で持つ。**
--   ・機能（ai_call_features）: メールの取り込み、のような大きな単位。
--     **unit_id が何を指すかは機能ごとに決める**（取り込みならメールの id）。
--   ・目的（ai_call_purposes）: 機能の中のどの段階か（抽出・再抽出・合体の判定）。
--     必ずどれか1つの機能に属する。
--   ・unit_id: 1回の処理のまとまり。**同じ機能で同じ unit_id の行が1まとまり**
--     （1通あたりの費用 = 機能で絞って unit_id ごとに足す）。
-- メール専用の列にしないのは、取り込み以外で LLM を使う時も同じ表に記録する
-- ため。機能が違えば unit_id の出どころが違うので、混ぜて数えない。旅行の id は
-- uuid ではないので text で持つ。
--
-- **unit_id は外部キーにしない。** 指す先（メール）が消えても値を残し、
-- 「何通処理したか」「1通あたりいくらか」を後から数えられるようにする。値は
-- 意味を持たない id なので、残っても利用者の中身は分からない。本文・金額など
-- 個人の中身はこの表に入れない。

create table public.ai_call_features (
  code text primary key,
  description text not null
);

insert into public.ai_call_features (code, description) values
  ('inbound_email', 'メールの取り込み。unit_id は取り込んだメール（inbound_emails）の id');

create table public.ai_call_purposes (
  code text primary key,
  feature text not null references public.ai_call_features (code),
  description text not null
);

insert into public.ai_call_purposes (code, feature, description) values
  ('inbound_extract', 'inbound_email', '本文からの抽出'),
  ('inbound_extract_link', 'inbound_email', 'リンク先の明細を足して抽出し直す第2パス'),
  ('inbound_merge', 'inbound_email', '既存の下書きと合体するかの判定（unit_id は新しく届いた側のメール）');

create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  purpose text not null references public.ai_call_purposes (code),
  unit_id text not null,
  -- 呼んだモデル（"google/gemini-2.5-flash" 等）。途中でモデルを変えても単価を分けて見られる。
  model text not null,
  input_tokens integer not null,
  -- 入力のうちキャッシュから読んだ分（単価が安い）。
  cached_input_tokens integer not null,
  output_tokens integer not null,
  -- 出力のうち、答える前に考えた分（Gemini 2.5 系は出力の大半を占めることがある）。
  reasoning_tokens integer not null,
  -- AI Gateway が返した費用（USD）。応答に費用が無かった時だけ null（数えようがない）。
  cost_usd numeric(14, 10)
);

create index ai_calls_created_at_idx on public.ai_calls (created_at);
create index ai_calls_purpose_unit_idx on public.ai_calls (purpose, unit_id);

alter table public.ai_call_features enable row level security;
alter table public.ai_call_purposes enable row level security;
alter table public.ai_calls enable row level security;

-- 管理者は運営のために読めるべき（費用の把握）。書き込みは取り込み処理
-- （service role）だけ。
create policy "ai_call_features_admin_select" on public.ai_call_features
  for select using (public.is_app_admin());
create policy "ai_call_purposes_admin_select" on public.ai_call_purposes
  for select using (public.is_app_admin());
create policy "ai_calls_admin_select" on public.ai_calls
  for select using (public.is_app_admin());

grant select on table public.ai_call_features to authenticated;
grant select on table public.ai_call_purposes to authenticated;
grant select on table public.ai_calls to authenticated;
grant all on table public.ai_call_features to service_role;
grant all on table public.ai_call_purposes to service_role;
grant all on table public.ai_calls to service_role;

-- 管理ページ用: 機能ごと・日別の費用と、処理したまとまりの数（取り込みなら
-- メールの通数）。行を全部送らずに DB で束ねる。日付は UTC（ai_usage_daily と同じ）。
-- まとまりは「同じ機能で同じ unit_id」なので、機能ごとに数える。
create or replace function public.admin_ai_cost_daily(p_since date)
returns table (feature text, day date, cost_usd numeric, units bigint)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  if not is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select p.feature,
           (c.created_at at time zone 'utc')::date as day,
           coalesce(sum(c.cost_usd), 0) as cost_usd,
           count(distinct c.unit_id) as units
    from public.ai_calls c
    join public.ai_call_purposes p on p.code = c.purpose
    where c.created_at >= p_since
    group by 1, 2
    order by 1, 2;
end;
$$;

alter function public.admin_ai_cost_daily(date) owner to postgres;
revoke all on function public.admin_ai_cost_daily(date) from public;
grant execute on function public.admin_ai_cost_daily(date) to authenticated;

-- 管理ページ用: 期間全体の機能ごとの費用とまとまりの数（1通あたりの単価に使う）。
-- 日別の units を足すと、日をまたいで処理したメールを二度数えるので、期間で
-- まとめて数える関数を別に持つ。
create or replace function public.admin_ai_cost_summary(p_since timestamptz)
returns table (feature text, cost_usd numeric, units bigint, calls bigint)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  if not is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select p.feature,
           coalesce(sum(c.cost_usd), 0) as cost_usd,
           count(distinct c.unit_id) as units,
           count(*) as calls
    from public.ai_calls c
    join public.ai_call_purposes p on p.code = c.purpose
    where c.created_at >= p_since
    group by 1;
end;
$$;

alter function public.admin_ai_cost_summary(timestamptz) owner to postgres;
revoke all on function public.admin_ai_cost_summary(timestamptz) from public;
grant execute on function public.admin_ai_cost_summary(timestamptz) to authenticated;
