-- 予約の TODO を「済み」で作れるようにする。
--
-- メールから取り込んだ航空券・列車・ホテル等の予約は、届いた時点で予約が
-- 済んでいる。予定を確定する時に要予約のチェックが入っていれば、予約の TODO を
-- 作ると同時に、作った本人（＝担当）がやった記録を入れる。
--
-- TODO を下書きの段階で先に作っておく形にはしない。確定する前にチェックを
-- 外されたら、TODO は作ってはいけないため。作るのは確定の瞬間だけ。
--
-- p_done は既定値 false。配布済みのアプリは2引数で呼ぶので、そのまま動く。
-- 既に予約の TODO がある時（編集）は p_done を見ない（済みかどうかは TODO 側で
-- 付け外しするもので、予定を保存し直すたびに上書きしない）。
--
-- 引数を足すと関数の識別子（引数の型の並び）が変わり、create or replace では
-- 2引数の版が別の関数として残る。残ると2引数の呼び出しがどちらに当たるか
-- 曖昧になるので、古い方を消してから作る。

drop function public.set_event_reservation(uuid, boolean);

create function public.set_event_reservation(p_event_id uuid, p_needs boolean, p_done boolean default false) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_uid       uuid := auth.uid();
  v_trip_id   text;
  v_creator   uuid;
  v_vis       text;
  v_title     text;
  v_start_at  timestamp;
  v_is_member boolean;
  v_todo_id   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id, created_by_member_id, visibility, title, start_at
    into v_trip_id, v_creator, v_vis, v_title, v_start_at
  from events
  where id = p_event_id;

  if v_trip_id is null then
    raise exception 'event not found';
  end if;

  select exists (
    select 1 from trip_members
    where trip_id = v_trip_id and user_id = v_uid and left_at is null
  ) into v_is_member;

  if not v_is_member then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  if not p_needs then
    delete from todos where event_id = p_event_id;
    return;
  end if;

  -- 既に予約TODOがあれば visibility だけ予定に追従させる（タイトル/優先度/done は保持）。
  -- 予定の公開範囲を shared↔private と変えたとき、予約TODOの可視範囲もズレないように同期する。
  if exists (select 1 from todos where event_id = p_event_id) then
    update todos set visibility = v_vis where event_id = p_event_id;
    -- 自分だけになったら、担当も作った本人だけに戻す。
    if v_vis = 'private' then
      delete from todo_assignees a
       using todos t
       where a.todo_id = t.id and t.event_id = p_event_id
         and a.member_id <> t.created_by_member_id;
      insert into todo_assignees (todo_id, member_id)
      select id, created_by_member_id from todos where event_id = p_event_id
      on conflict do nothing;
      update todos set assignee_everyone = false where event_id = p_event_id;
    end if;
    return;
  end if;

  insert into todos (trip_id, created_by_member_id, title, priority, kind, visibility, event_id)
  values (
    v_trip_id, v_creator,
    to_char(v_start_at::date, 'FMMM/FMDD') || ' ' || v_title || 'の予約',
    'high', 'prep', v_vis, p_event_id
  )
  returning id into v_todo_id;

  insert into todo_assignees (todo_id, member_id) values (v_todo_id, v_creator);

  -- 予約が済んでいる（取り込んだ予約メールから確定した）なら、担当がやった
  -- 記録を入れる。todos.done はトリガが計算する。
  if p_done then
    insert into todo_completions (todo_id, member_id) values (v_todo_id, v_creator);
  end if;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;

revoke all on function public.set_event_reservation(uuid, boolean, boolean) from public;
grant all on function public.set_event_reservation(uuid, boolean, boolean) to authenticated;
