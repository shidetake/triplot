-- 取り込みを手でまとめる。
--
-- ■ なぜ要るか
-- 合体の判断は LLM がやるので外れることがあり、外れ方は2方向ある。
--
--   合体しすぎた → unmerge_inbound_email で戻せる
--   合体しなかった → **戻す手段が無かった**
--
-- 実際に外れるのは「合体しなかった」側のほうが多い（実測: 同じ乗車の4通が
-- 2つに分かれたまま残った）。片方向にしか直せないのは不便なので対を作る。
--
-- ■ どう合体するか
-- **選んだ側（親）の内容をそのまま残し、もう一方を畳む。** LLM は呼ばない。
--
-- 中身の組み立て（仮売上に調整額を足すのか等）は判断なので自動の合体では LLM に
-- やらせているが、手で合体する時は**人がどちらを残すか選んでいる**ので判断は済んで
-- いる。ここで LLM を呼ぶと、人が決めたことをもう一度機械に決め直させることになる。
-- 金額を足したい場合は確定フォームで直せる。
--
-- unmerge と対称になる（あちらも各自の extracted に戻すだけ）。
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

  -- どちらも自分のもので、まだ確定・破棄していないこと。
  -- 親が既に他へ畳まれている場合も許さない（畳み先の畳み先、を作らない）。
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

  -- 子の下書きは畳んだので消す。親は自分の extracted のまま（内容は変えない）。
  perform rebuild_inbound_drafts(p_child);
end;
$$;

revoke execute on function public.merge_inbound_emails(uuid, uuid) from public;
grant execute on function public.merge_inbound_emails(uuid, uuid) to authenticated;
