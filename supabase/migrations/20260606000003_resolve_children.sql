-- ────────────────────────────────────────────────────────────
-- 解決時に「合体された子メール」の痩せ版も消す（保持最小化）
-- ────────────────────────────────────────────────────────────
-- マージは各メールの行に body_text を残し merged_into でグループを辿る方式。
-- ターゲットを確定/破棄したら、そのグループ（子の merged 行）も raw・body_text を消す。

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
      expense_id = case when p_status = 'confirmed' then p_expense_id else null end,
      raw = null,
      body_text = null
  where id = p_id and user_id = v_uid;
  -- 合体された子メールも痩せ版を消す。
  update inbound_emails
  set raw = null, body_text = null
  where merged_into = p_id and user_id = v_uid;
end;
$body$;
