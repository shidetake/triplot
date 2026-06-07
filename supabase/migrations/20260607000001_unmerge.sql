-- ────────────────────────────────────────────────────────────
-- 誤マージの取り消し（split）
-- ────────────────────────────────────────────────────────────
-- 合体された子メール（status=merged）を独立した下書き（extracted）に戻す。
-- ターゲットの金額は戻さない（確定画面でユーザが直す前提）。本人の行のみ。

create or replace function public.unmerge_inbound_email(p_id uuid)
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
  update inbound_emails
  set status = 'extracted', merged_into = null
  where id = p_id and user_id = v_uid and status = 'merged';
end;
$body$;

revoke all on function public.unmerge_inbound_email(uuid) from public;
grant execute on function public.unmerge_inbound_email(uuid) to authenticated;
