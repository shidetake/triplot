-- TODO の旧担当者の列（assignee_member_id）を消す。
--
-- 20261002000000 で入れた「担当者1人」の列は、20261003020000 で担当を
-- 「未定／全員／一部」（assignee_everyone ＋ todo_assignees）にした時点で
-- 使わなくなった。読み書きしていた試験版（TestFlight 1.1.0 (239)・(240)）が
-- 使われなくなったので、値を合わせていた関数から外し、列と制約・索引を消す。
-- 一般に配布した版はこの列を知らない。

create or replace function public.create_todo(p_trip_id text, p_title text, p_priority text, p_kind text, p_visibility text) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_uid          uuid := auth.uid();
  v_my_member_id uuid;
  v_todo_id      uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;
  if p_priority not in ('high', 'medium', 'low') then
    raise exception 'invalid priority';
  end if;
  if p_kind not in ('prep', 'onsite') then
    raise exception 'invalid kind';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  insert into todos (trip_id, created_by_member_id, title, priority, kind, visibility)
  values (p_trip_id, v_my_member_id, trim(p_title), p_priority, p_kind, p_visibility)
  returning id into v_todo_id;

  -- 担当の初期値は作った人（一部・1人）。
  insert into todo_assignees (todo_id, member_id) values (v_todo_id, v_my_member_id);

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_todo_id;
end;
$$;


create or replace function public.set_event_reservation(p_event_id uuid, p_needs boolean) returns void
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

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;


create or replace function public.set_todo_assignees(p_todo_id uuid, p_everyone boolean, p_member_ids uuid[])
returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_uid      uuid := auth.uid();
  v_trip_id  text;
  v_vis      text;
  v_ids      uuid[] := case when p_everyone then '{}'::uuid[] else coalesce(p_member_ids, '{}'::uuid[]) end;
  v_bad      int;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id, visibility into v_trip_id, v_vis from todos where id = p_todo_id;
  if v_trip_id is null or not is_active_trip_member(v_trip_id) then
    raise exception 'todo not found' using errcode = '42501';
  end if;
  if v_vis = 'private' then
    raise exception 'private todo assignee is fixed';
  end if;

  select count(*) into v_bad
    from unnest(v_ids) as pid
   where not exists (
     select 1 from trip_members m
      where m.id = pid and m.trip_id = v_trip_id and m.left_at is null
   );
  if v_bad > 0 then
    raise exception 'invalid assignee member';
  end if;

  -- 先に担当の行を入れ替え、最後にフラグを書く（フラグの更新で done が
  -- 新しい担当で計算し直される）。
  delete from todo_assignees where todo_id = p_todo_id;
  insert into todo_assignees (todo_id, member_id)
  select p_todo_id, m from unnest(v_ids) as m
  on conflict do nothing;

  update todos
     set assignee_everyone = coalesce(p_everyone, false)
   where id = p_todo_id;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;


create or replace function "public"."redeem_guest_upgrade_ticket"("p_token" "text") returns "void"
    language "plpgsql" security definer
    set "search_path" to 'public'
    as $$
declare
  v_uid         uuid := auth.uid();
  v_guest_uid   uuid;
  v_guest_member record;
  v_mine_id     uuid;
  v_mine_admin  boolean;
  v_mine_left   timestamp with time zone;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update guest_upgrade_tickets
     set used_at = now()
   where token = p_token
     and used_at is null
     and expires_at > now()
  returning guest_user_id into v_guest_uid;

  if v_guest_uid is null then
    raise exception 'upgrade ticket not found' using errcode = '42501';
  end if;

  if v_guest_uid = v_uid then
    raise exception 'still signed in as the guest' using errcode = '42501';
  end if;

  -- ゲストの旅行を1つずつ引き取る。
  for v_guest_member in
    select id, trip_id, is_admin, left_at from trip_members where user_id = v_guest_uid
  loop
    select id, is_admin, left_at
      into v_mine_id, v_mine_admin, v_mine_left
      from trip_members
     where trip_id = v_guest_member.trip_id and user_id = v_uid;

    if v_mine_id is not null then
      -- 同じ旅行に自分のメンバー行も既にある。**ゲストの行を残して**そちらへ寄せる
      -- （表示名と色はゲスト時代のものを残す）。
      --
      -- trip_members を参照する外部キーは 8 本が ON DELETE CASCADE なので、
      -- 先に参照側を付け替えてから古い行を消す。順序を逆にすると書き込みが
      -- 道連れで消える。
      --
      -- expense_splits / event_participants / todo_likes / todo_assignees /
      -- todo_completions は (親id, member_id) が
      -- 複合主キーなので、素の update だと一意制約に当たる。寄せられるものだけ
      -- insert して、残りは cascade で消えるに任せる。
      insert into expense_splits (expense_id, member_id)
        select expense_id, v_guest_member.id
          from expense_splits where member_id = v_mine_id
        on conflict do nothing;

      insert into event_participants (event_id, member_id)
        select event_id, v_guest_member.id
          from event_participants where member_id = v_mine_id
        on conflict do nothing;

      insert into todo_likes (todo_id, member_id)
        select todo_id, v_guest_member.id
          from todo_likes where member_id = v_mine_id
        on conflict do nothing;

      insert into todo_assignees (todo_id, member_id)
        select todo_id, v_guest_member.id
          from todo_assignees where member_id = v_mine_id
        on conflict do nothing;

      insert into todo_completions (todo_id, member_id, completed_at)
        select todo_id, v_guest_member.id, completed_at
          from todo_completions where member_id = v_mine_id
        on conflict do nothing;

      update expenses set created_by_member_id = v_guest_member.id
       where created_by_member_id = v_mine_id;
      update expenses set payer_member_id = v_guest_member.id
       where payer_member_id = v_mine_id;
      update events set created_by_member_id = v_guest_member.id
       where created_by_member_id = v_mine_id;
      update places set created_by_member_id = v_guest_member.id
       where created_by_member_id = v_mine_id;
      update todos set created_by_member_id = v_guest_member.id
       where created_by_member_id = v_mine_id;
      update trip_invites set created_by_member_id = v_guest_member.id
       where created_by_member_id = v_mine_id;

      delete from trip_members where id = v_mine_id;

      -- 管理者はどちらかが持っていれば引き継ぐ。在籍もどちらかが生きていれば生きる。
      update trip_members
         set user_id  = v_uid,
             kind     = 'member',
             is_admin = v_guest_member.is_admin or coalesce(v_mine_admin, false),
             left_at  = case
                          when v_guest_member.left_at is null or v_mine_left is null
                          then null else v_guest_member.left_at
                        end
       where id = v_guest_member.id;
    else
      -- 自分はこの旅行にいない。メンバー行の持ち主を差し替えるだけで、
      -- 中身はすべてメンバー行にぶら下がっているので付いてくる。
      update trip_members
         set user_id = v_uid, kind = 'member'
       where id = v_guest_member.id;
    end if;
  end loop;

  -- auth.users の UPDATE にはトリガが無く、public.users.is_anonymous は
  -- サインインしても true のまま残る。join_trip_via_invite がこの列を見て
  -- kind を決めるので、ここで確実に落としておく。
  update users set is_anonymous = false where id = v_uid;

  -- ゲストのユーザーはもう何も持っていないので消す。
  -- auth.users → public.users は CASCADE（delete_account と同じ経路）。
  delete from auth.users where id = v_guest_uid;
end;
$$;

alter table public.todos drop constraint if exists todos_private_assignee_check;
alter table public.todos drop constraint if exists todos_assignee_member_fkey;
drop index if exists public.todos_assignee_idx;
alter table public.todos drop column assignee_member_id;
