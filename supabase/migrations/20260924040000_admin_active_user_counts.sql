-- 管理ページの「アクティブユーザー数」。専用のトラッキングは持たず、
-- Supabase Auth が既に持っている値を読むだけ。
--
-- 期間は**半年（180日）の1本**に決め打つ。旅行計画アプリは日常アプリと違い
-- 使う間隔が空くのが普通なので、直近7日・30日のような細かい刻みは実態に
-- 合わない（旅行の計画期間・頻度を考えると半年〜1年が妥当。まずは半年）。
-- 複数期間を並べて選ばせるほどの使い方をしないので、1本に決め打って単純にする。
--
-- **auth.users.last_sign_in_at だけでは判定しない。** この列は明示的な
-- サインイン（ログイン・匿名サインインでの新規参加）でのみ動き、JWT の
-- リフレッシュでは更新されない。triplot はセッションを AsyncStorage/cookie に
-- 持ち回って裏で自動更新し続ける作りなので、ログインしたまま何ヶ月も使い
-- 続けている人ほど last_sign_in_at が古いまま止まる（実測: 本番であるユーザーの
-- セッションが作成から1.5日経っても再ログイン無しに refreshed_at/updated_at だけ
-- 進んでいた）。継続利用ほど「アクティブでない」扱いになる逆転が起きるため、
-- **auth.sessions の更新時刻も見て「いずれかが半年以内」なら active**とする。
--
-- 集計は public.users.is_anonymous を軸にする（登録ユーザー数の表示と同じ定義に
-- 揃える）。ゲスト→本登録の昇格は public.users.is_anonymous を直接 false に
-- 落とすだけで auth.users 側は追随しない（guest_upgrade_tickets の
-- redeem_guest_upgrade_ticket 参照）ため、public.users を単一の真実にする。

-- 実際の集計ロジック（admin ゲートなし・外部には公開しない）。admin 向けの
-- 単発表示（admin_active_user_count）と、日次スナップショット
-- （record_daily_user_stats）の両方から呼ぶための共通部分。
-- SECURITY DEFINER の呼び出し元（どちらも owner=postgres）が実行者になるので、
-- EXECUTE 権限を authenticated/anon/service_role の誰にも配らなくてよい
-- （postgres 自身は自分が owner の関数を常に実行できる）。
create or replace function "public"."compute_active_user_count"()
returns bigint
language "sql" stable security definer
set "search_path" to 'public'
as $$
  select count(distinct au.id)
  from auth.users au
  join public.users pu on pu.id = au.id
  left join auth.sessions s on s.user_id = au.id
  where pu.is_anonymous = false
    and (
      au.last_sign_in_at >= now() - interval '180 days'
      or s.updated_at >= now() - interval '180 days'
    );
$$;

alter function "public"."compute_active_user_count"() owner to "postgres";
revoke all on function "public"."compute_active_user_count"() from public;

-- 管理ページが今この瞬間の値を出すための窓口（is_app_admin() ゲート付き）。
create or replace function "public"."admin_active_user_count"()
returns bigint
language "plpgsql" security definer
set "search_path" to 'public'
as $$
begin
  if not is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return "public"."compute_active_user_count"();
end;
$$;

alter function "public"."admin_active_user_count"() owner to "postgres";

revoke all on function "public"."admin_active_user_count"() from public;
grant all on function "public"."admin_active_user_count"() to "authenticated";


-- ── ここから「登録ユーザー数・アクティブユーザー数の推移」用の日次スナップショット ──
--
-- 「アクティブ」は直近半年の**ローリング窓**の値で、履歴を遡って再計算する材料
-- （auth.audit_log_entries 等）が本プロジェクトには残っていない（実測: 0行）ため、
-- 過去の値は作れない。登録ユーザー数だけは users.created_at から過去分も
-- 計算できるので、そちらは全期間ぶんバックフィルする。今日から先は Vercel Cron
-- （/api/cron/user-stats-daily、expire-inbound と同じ形）が毎日1行ずつ足す。
create table if not exists "public"."user_stats_daily" (
  "day" date not null primary key,
  "registered_count" bigint not null,
  -- 過去分は算出できないので null 許容（今日以降の行から実値が入る）。
  "active_count" bigint
);

alter table "public"."user_stats_daily" owner to "postgres";

-- 読めるのは admin だけ（users_admin_select 等と同じ is_app_admin() ゲート）。
-- 管理ページはログイン中の admin のセッションで読むので service role key に
-- 依存しない。書き込みのポリシーは置かない＝書けるのは
-- record_daily_user_stats（SECURITY DEFINER）経由だけ。
alter table "public"."user_stats_daily" enable row level security;

create policy "user_stats_daily_admin_select" on "public"."user_stats_daily"
  for select using ("public"."is_app_admin"());

grant all on table "public"."user_stats_daily" to "anon";
grant all on table "public"."user_stats_daily" to "authenticated";
grant all on table "public"."user_stats_daily" to "service_role";

-- 今日ぶんのスナップショットを1行 upsert する。Vercel Cron（service_role）専用。
create or replace function "public"."record_daily_user_stats"()
returns void
language "plpgsql" security definer
set "search_path" to 'public'
as $$
declare
  v_registered bigint;
begin
  select count(*) into v_registered
  from public.users
  where is_anonymous = false;

  insert into public.user_stats_daily (day, registered_count, active_count)
  values (current_date, v_registered, "public"."compute_active_user_count"())
  on conflict (day) do update
    set registered_count = excluded.registered_count,
        active_count = excluded.active_count;
end;
$$;

alter function "public"."record_daily_user_stats"() owner to "postgres";

revoke all on function "public"."record_daily_user_stats"() from public;
grant all on function "public"."record_daily_user_stats"() to "service_role";

-- 登録ユーザー数だけ過去分をバックフィルする（初回導入時の1回きりの処理。
-- users.created_at は「その行が is_anonymous=false になった時刻」と一致する
-- ——直接登録はその瞬間に作られ、ゲストからの昇格は昇格の瞬間に新しい行が
-- 作られるため。日ごとの新規数を累積すれば過去の任意の日の登録ユーザー数になる）。
insert into "public"."user_stats_daily" ("day", "registered_count", "active_count")
select
  d.day,
  sum(coalesce(n.new_count, 0)) over (order by d.day) as registered_count,
  null::bigint
from generate_series(
  (select coalesce(min(created_at)::date, current_date) from public.users where is_anonymous = false),
  current_date - 1,
  interval '1 day'
) as d(day)
left join (
  select created_at::date as day, count(*) as new_count
  from public.users
  where is_anonymous = false
  group by 1
) n on n.day = d.day
on conflict (day) do nothing;

-- 今日ぶんは実値（アクティブ数込み）で確定させる。
select "public"."record_daily_user_stats"();
