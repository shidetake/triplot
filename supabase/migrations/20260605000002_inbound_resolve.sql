-- ────────────────────────────────────────────────────────────
-- 受信メール下書きのレビュー（取り込み受信箱）— 読み取りと解決
-- ────────────────────────────────────────────────────────────
-- 本人は自分の受信メール（下書き）を読めるようにし、レビューで「確定（費用化）」
-- または「破棄」できるようにする。status を拡張し、確定時に作成した費用を expense_id
-- で紐づける。

-- status の許容値を拡張（confirmed / dismissed を追加）。
alter table inbound_emails drop constraint inbound_emails_status_check;
alter table inbound_emails
  add constraint inbound_emails_status_check
  check (status in (
    'pending', 'extracted', 'over_quota', 'error', 'confirmed', 'dismissed'
  ));

alter table inbound_emails
  add column expense_id uuid references expenses(id) on delete set null;

-- 本人は自分の受信メールを読める（生メール raw も含むので user_id 一致のみ）。
create policy inbound_emails_select_own on inbound_emails for select
  using (user_id = auth.uid());

-- 下書きの解決：本人の行のみ confirmed/dismissed に更新。確定時は expense_id を紐づけ。
create or replace function public.resolve_inbound_email(
  p_id         uuid,
  p_status     text,
  p_expense_id uuid default null
)
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
  if p_status not in ('confirmed', 'dismissed') then
    raise exception 'invalid status';
  end if;
  update inbound_emails
  set status = p_status,
      expense_id = case when p_status = 'confirmed' then p_expense_id else null end
  where id = p_id and user_id = v_uid;
end;
$body$;

revoke all on function public.resolve_inbound_email(uuid, text, uuid) from public;
grant execute on function public.resolve_inbound_email(uuid, text, uuid) to authenticated;
