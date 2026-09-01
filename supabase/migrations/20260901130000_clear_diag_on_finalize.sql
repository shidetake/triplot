-- 確定・破棄したメールでは診断メモも消す。
--
-- inbound_emails の行は、確定/破棄すると 90 日の自動削除の対象から外れる
-- （expire-inbound が status を除外している）。そのままだと diag が無期限に残る。
-- 診断メモは「取り込みが正しく動いたかを後から追う」ためのもので、確定した
-- 時点で用は済んでいるので、raw / body_text と同じタイミングで捨てる。
--
-- これで diag の寿命は「最大90日」に揃う（未確定のまま放置 → 90日で行ごと削除、
-- 確定/破棄 → その場で消える）。
create or replace function public.finalize_inbound_email_if_resolved(
  p_email_id uuid,
  p_uid uuid
) returns void
  language plpgsql security definer
  set search_path to 'public'
  as $$
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
      body_text = null,
      diag = null
  where id = p_email_id and user_id = p_uid
    and status in ('extracted', 'error', 'over_quota');
  update inbound_emails
  set raw = null, body_text = null, diag = null
  where merged_into = p_email_id and user_id = p_uid;
end;
$$;
