-- 手で合体する時に「重複」か「合算」かを選べるようにし、空欄は相手から埋める。
--
-- ■ なぜ
-- LLM の合体の外し方は2種類あり、直し方も2種類要る。
--   同じものを2件に分けた       → 片方を残す（重複）
--   チップ・調整を別扱いにした  → 足す（合算。20 + 2 = 22 は実際によくある形）
--
-- また、片方を残すだけでは情報が増えず「× で破棄」とほぼ同じだった。店の
-- レシートと銀行の通知は持っている情報が違う（店名・品目・時刻はレシート、
-- 承認番号は銀行）。**選んだ側を主にし、空いている項目だけ相手から埋める**。
-- 上書きはしないので、人が「こちらを残す」と決めたことと矛盾しない。
--
-- ■ 合体結果は下書きに書く（extracted は触らない）
-- 自動の合体と同じ形にする。各メールの extracted は自分のものを保つので、
-- 分割すれば元に戻る。
create or replace function public.merge_inbound_emails(
  p_child uuid,
  p_parent uuid,
  p_mode text default 'dedupe'
) returns void
  language plpgsql security definer
  set search_path to 'public'
  as $$
declare
  v_uid    uuid := auth.uid();
  v_child  jsonb;
  v_parent jsonb;
  v_kept   jsonb;   -- 親の receipt のうち中身のある項目だけ
  v_merged jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_child = p_parent then
    raise exception 'cannot merge into itself' using errcode = '22023';
  end if;
  if p_mode not in ('dedupe', 'sum') then
    raise exception 'unknown merge mode' using errcode = '22023';
  end if;

  select extracted into v_child from inbound_emails
  where id = p_child and user_id = v_uid and status = 'extracted';
  select extracted into v_parent from inbound_emails
  where id = p_parent and user_id = v_uid and status = 'extracted'
    and merged_into is null;
  if not found or v_child is null then
    raise exception 'not mergeable' using errcode = '22023';
  end if;

  -- 子に畳まれていたものは新しい親へ付け替える（孫を作らない）。
  update inbound_emails set merged_into = p_parent
  where merged_into = p_child and user_id = v_uid;

  update inbound_emails set status = 'merged', merged_into = p_parent
  where id = p_child and user_id = v_uid;

  -- 畳んだ側の下書きは消す（作り直さない）。確定済みのものは残す。
  delete from inbound_drafts where email_id = p_child and status = 'pending';

  -- 費用の合体。どちらかに receipt が無ければ何もしない（予定だけのメール等）。
  if jsonb_typeof(v_parent -> 'receipt') = 'object'
     and jsonb_typeof(v_child -> 'receipt') = 'object' then
    -- 親の「中身のある項目」だけを取り出す（null と空文字は無いものとして扱う）。
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_kept
    from jsonb_each(v_parent -> 'receipt') as e(k, v)
    where v <> 'null'::jsonb and v <> '""'::jsonb;

    -- 子を土台に、親の中身のある項目で上書き＝空欄だけ子から埋まる。
    v_merged := (v_child -> 'receipt') || v_kept;

    -- 合算は通貨が同じ時だけ（換算は別の判断なので、ここではやらない）。
    if p_mode = 'sum'
       and (v_parent -> 'receipt' ->> 'currency')
           is not distinct from (v_child -> 'receipt' ->> 'currency') then
      v_merged := jsonb_set(
        v_merged,
        '{total}',
        to_jsonb(
          coalesce((v_parent -> 'receipt' ->> 'total')::numeric, 0)
          + coalesce((v_child -> 'receipt' ->> 'total')::numeric, 0)
        )
      );
    end if;

    update inbound_drafts
    set payload = v_merged
    where email_id = p_parent and kind = 'expense' and status = 'pending';
  end if;
end;
$$;

revoke execute on function public.merge_inbound_emails(uuid, uuid, text) from public;
grant execute on function public.merge_inbound_emails(uuid, uuid, text) to authenticated;
drop function if exists public.merge_inbound_emails(uuid, uuid);
