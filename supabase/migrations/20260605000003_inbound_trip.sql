-- ────────────────────────────────────────────────────────────
-- 受信メール下書きの「旅行割り当て」（取り込み・Stage2 再設計）
-- ────────────────────────────────────────────────────────────
-- 受信箱では「どの旅行か」だけを先に割り当てる（trip_id）。費用化（確定）は
-- 旅行画面でその旅行の文脈を使って行う。割当済・未確定の下書きは受信箱にも
-- 旅行画面にも出る。expenses は汚さず、未完成は inbound_emails 側で吸収する。

alter table inbound_emails
  add column trip_id text references trips(id) on delete set null;

create index inbound_emails_trip_idx on inbound_emails (trip_id);

-- 下書きを旅行に割り当てる（本人の行のみ／割当先は本人がアクティブメンバーの旅行）。
-- p_trip_id = null で未割当に戻せる。
create or replace function public.assign_inbound_email_trip(
  p_id      uuid,
  p_trip_id text
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
  if not exists (
    select 1 from inbound_emails where id = p_id and user_id = v_uid
  ) then
    raise exception 'draft not found';
  end if;
  if p_trip_id is not null and not public.is_active_trip_member(p_trip_id) then
    raise exception 'not a member of the trip' using errcode = '42501';
  end if;
  update inbound_emails
  set trip_id = p_trip_id
  where id = p_id and user_id = v_uid;
end;
$body$;

revoke all on function public.assign_inbound_email_trip(uuid, text) from public;
grant execute on function public.assign_inbound_email_trip(uuid, text) to authenticated;
