-- 手で合体した時、畳んだ側の下書きを消す。
--
-- merge_inbound_emails が rebuild_inbound_drafts(child) を呼んでいたのが誤り。
-- あれは「自分の extracted から下書きを作り直す」関数なので、畳んだ側で呼ぶと
-- 消したいものが復活する（実測: 手で合体した直後、merged の行に下書きが2件
-- 残っていた）。放置すると旅行の画面に重複した未確定費用が出る。
--
-- 自動の合体は畳む側の下書きを作らない（process.ts「来たメールは merged として
-- 畳む（draft 行は作らない）」）。手で合体した時も同じ状態にする。
-- 分割（unmerge）は各自の extracted から作り直すので、戻せることは変わらない。
create or replace function public.merge_inbound_emails(
  p_child uuid,
  p_parent uuid
) returns void
  language plpgsql security definer
  set search_path to 'public'
  as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_child = p_parent then
    raise exception 'cannot merge into itself' using errcode = '22023';
  end if;

  if not exists (
    select 1 from inbound_emails
    where id = p_child and user_id = v_uid and status = 'extracted'
  ) or not exists (
    select 1 from inbound_emails
    where id = p_parent and user_id = v_uid and status = 'extracted'
      and merged_into is null
  ) then
    raise exception 'not mergeable' using errcode = '22023';
  end if;

  -- 子に畳まれていたものは、新しい親へ付け替える（孫を作らない）。
  update inbound_emails
  set merged_into = p_parent
  where merged_into = p_child and user_id = v_uid;

  update inbound_emails
  set status = 'merged', merged_into = p_parent
  where id = p_child and user_id = v_uid;

  -- 畳んだ側の下書きは消す（作り直さない）。確定済みのものは残す。
  delete from inbound_drafts
  where email_id = p_child and status = 'pending';
end;
$$;
