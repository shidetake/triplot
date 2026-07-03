-- ────────────────────────────────────────────────────────────
-- 取り込み下書きの統一テーブル（費用 + 予定）
-- ────────────────────────────────────────────────────────────
-- 予定（events）の取り込み対応で「1メール = 費用 0..1 件 + 予定 0..N 件」になり、
-- 項目ごとの個別確定が必要になった。メール行の jsonb（merged_extracted）が担っていた
-- 「作業コピー」を inbound_drafts の行に移し、費用/予定を kind で区別して統一する。
--
--   inbound_emails.extracted = そのメール自身の抽出結果 { receipt, events }（不変。
--                              unmerge の復元元・split 判断表示用）
--   inbound_drafts           = 可変の作業状態（マージは pending 行を直接更新）
--
-- メールの status 値は現状のまま。confirmed/dismissed は「全 draft 解決時」に自動確定し、
-- そのタイミングで raw/body_text（合体子も）を消す。

-- 開発期ポリシー: 既存データはテスト用。旧形状（extracted = Receipt 単体）の行は
-- backfill せず消す。
truncate inbound_emails cascade;

alter table inbound_emails drop column merged_extracted;
alter table inbound_emails drop column expense_id;

create table inbound_drafts (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references inbound_emails(id) on delete cascade,
  kind text not null check (kind in ('expense', 'event')),
  payload jsonb not null, -- Receipt または EventDraft（apps/web/lib/import/schema.ts）
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'dismissed')),
  expense_id uuid references expenses(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expense_id is null or kind = 'expense'),
  check (event_id is null or kind = 'event')
);

create index inbound_drafts_email_idx on inbound_drafts (email_id);

-- 本人は自分のメールの下書きを読める。書き込みは service role / SECURITY DEFINER RPC のみ
-- （INSERT/UPDATE/DELETE ポリシー無し）。
alter table inbound_drafts enable row level security;
create policy inbound_drafts_select_own on inbound_drafts for select
  using (
    exists (
      select 1 from inbound_emails e
      where e.id = email_id and e.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- 内部ヘルパ（grant なし = SECURITY DEFINER RPC と service role からのみ）
-- ────────────────────────────────────────────────────────────

-- pending の draft 行を、そのメール自身の extracted（{ receipt, events }）から作り直す。
-- confirmed/dismissed の行は触らない。確定済みと同内容の再挿入は防ぐ（expense は
-- confirmed が居れば挿入しない / event は payload 一致の confirmed をスキップ。
-- マージで payload が変わった後に確定した event は一致せず重複が残りうるが、
-- 稀なので unmerge の MVP セマンティクス（合体消失の許容）と同様に許容する）。
create or replace function public.rebuild_inbound_drafts(p_email_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_extracted jsonb;
begin
  select extracted into v_extracted from inbound_emails where id = p_email_id;
  delete from inbound_drafts where email_id = p_email_id and status = 'pending';
  if v_extracted is null then
    return;
  end if;
  if jsonb_typeof(v_extracted -> 'receipt') = 'object'
     and not exists (
       select 1 from inbound_drafts
       where email_id = p_email_id and kind = 'expense' and status = 'confirmed'
     ) then
    insert into inbound_drafts (email_id, kind, payload)
    values (p_email_id, 'expense', v_extracted -> 'receipt');
  end if;
  insert into inbound_drafts (email_id, kind, payload)
  select p_email_id, 'event', ev.value
  from jsonb_array_elements(coalesce(v_extracted -> 'events', '[]'::jsonb)) ev
  where not exists (
    select 1 from inbound_drafts d
    where d.email_id = p_email_id and d.kind = 'event'
      and d.status = 'confirmed' and d.payload = ev.value
  );
end;
$body$;

revoke all on function public.rebuild_inbound_drafts(uuid) from public;

-- pending の draft が残っていなければメールを最終化する: 1件でも confirmed があれば
-- confirmed、全て dismissed（or draft ゼロ）なら dismissed。raw/body_text と合体子の
-- 痩せ版もここで消す（保持最小化）。
create or replace function public.finalize_inbound_email_if_resolved(
  p_email_id uuid,
  p_uid      uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_pending   int;
  v_confirmed int;
begin
  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'confirmed')
  into v_pending, v_confirmed
  from inbound_drafts
  where email_id = p_email_id;
  if v_pending > 0 then
    return;
  end if;
  update inbound_emails
  set status = case when v_confirmed > 0 then 'confirmed' else 'dismissed' end,
      raw = null,
      body_text = null
  where id = p_email_id and user_id = p_uid
    and status in ('extracted', 'error', 'over_quota');
  update inbound_emails
  set raw = null, body_text = null
  where merged_into = p_email_id and user_id = p_uid;
end;
$body$;

revoke all on function public.finalize_inbound_email_if_resolved(uuid, uuid) from public;

-- ────────────────────────────────────────────────────────────
-- 公開 RPC
-- ────────────────────────────────────────────────────────────

-- メール単位の解決は draft 単位の解決に置き換え。
drop function public.resolve_inbound_email(uuid, text, uuid);

-- draft を1件確定/破棄する。確定時は作成した費用/予定を expense_id/event_id で紐づけ
-- （kind との整合はテーブルの CHECK が守る）。親メールに pending が残っていなければ
-- メールを最終化する。
create or replace function public.resolve_inbound_draft(
  p_id         uuid,
  p_status     text,
  p_expense_id uuid default null,
  p_event_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid      uuid := auth.uid();
  v_email_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_status not in ('confirmed', 'dismissed') then
    raise exception 'invalid status';
  end if;
  update inbound_drafts d
  set status = p_status,
      expense_id = case when p_status = 'confirmed' then p_expense_id else null end,
      event_id   = case when p_status = 'confirmed' then p_event_id else null end
  from inbound_emails e
  where d.id = p_id and d.status = 'pending'
    and e.id = d.email_id and e.user_id = v_uid
  returning d.email_id into v_email_id;
  if v_email_id is null then
    return;
  end if;
  perform finalize_inbound_email_if_resolved(v_email_id, v_uid);
end;
$body$;

revoke all on function public.resolve_inbound_draft(uuid, text, uuid, uuid) from public;
grant execute on function public.resolve_inbound_draft(uuid, text, uuid, uuid) to authenticated;

-- メール単位の「破棄」: 残っている pending draft を全部 dismissed にして最終化する
-- （確定済みの draft はそのまま）。draft を持たない error / over_quota のメールも
-- これで dismissed にできる。
create or replace function public.dismiss_inbound_email(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  update inbound_drafts d
  set status = 'dismissed'
  from inbound_emails e
  where d.email_id = p_id and d.status = 'pending'
    and e.id = d.email_id and e.user_id = v_uid;
  perform finalize_inbound_email_if_resolved(p_id, v_uid);
end;
$body$;

revoke all on function public.dismiss_inbound_email(uuid) from public;
grant execute on function public.dismiss_inbound_email(uuid) to authenticated;

-- split（誤マージ取り消し）: 子を独立下書きに戻して draft 行を自身の extracted から
-- 再生成し、親の pending draft も親自身の extracted の値に戻す（合体を解消）。
-- ※ 親に他の子が残る多重マージでは合体が失われるが、稀なので MVP では許容（現状踏襲）。
create or replace function public.unmerge_inbound_email(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid    uuid := auth.uid();
  v_parent uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select merged_into into v_parent
  from inbound_emails
  where id = p_id and user_id = v_uid and status = 'merged';
  if v_parent is null then
    return;
  end if;
  update inbound_emails
  set status = 'extracted', merged_into = null
  where id = p_id and user_id = v_uid;
  perform rebuild_inbound_drafts(p_id);
  perform rebuild_inbound_drafts(v_parent);
end;
$body$;

revoke all on function public.unmerge_inbound_email(uuid) from public;
grant execute on function public.unmerge_inbound_email(uuid) to authenticated;
