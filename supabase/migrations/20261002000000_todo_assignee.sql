-- TODO に担当者を持たせる。
--
-- 担当者は「その TODO を誰がやるか」。NULL は「未定」（みんなで・まだ決めて
-- いない）で、実際にデータが存在しない状態なので NULL を許す。新しく作る時の
-- 初期値は作った人（作成の RPC が埋める）。
--
-- 担当者は同じ旅行のメンバーに限る。trip_members(id, trip_id) への複合外部キーで
-- DB が保証する。メンバー行が消えたら担当者だけを外す（trip_id は残す）。

alter table public.trip_members
  add constraint trip_members_id_trip_id_key unique (id, trip_id);

alter table public.todos
  add column assignee_member_id uuid;

alter table public.todos
  add constraint todos_assignee_member_fkey
    foreign key (assignee_member_id, trip_id)
    references public.trip_members (id, trip_id)
    on delete set null (assignee_member_id);

-- 自分だけの TODO の担当は作った本人（か未定）。他人を担当にすると、その人には
-- 見えない TODO を担当させることになる。
alter table public.todos
  add constraint todos_private_assignee_check
    check (
      visibility = 'shared'
      or assignee_member_id is null
      or assignee_member_id = created_by_member_id
    );

-- 既存の TODO は、今まで表示していた「作った人」を担当者にする（見た目を変えない）。
update public.todos set assignee_member_id = created_by_member_id;

create index todos_assignee_idx on public.todos using btree (assignee_member_id);


-- 作成: 担当者の初期値は作った人。引数は変えない（配布済みのアプリがそのまま
-- 呼べるように）。
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

  insert into todos (trip_id, created_by_member_id, assignee_member_id, title, priority, kind, visibility)
  values (p_trip_id, v_my_member_id, v_my_member_id, trim(p_title), p_priority, p_kind, p_visibility)
  returning id into v_todo_id;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_todo_id;
end;
$$;


-- 予約TODO: 担当者の初期値は予定を作った人。予定が自分だけのものになったら、
-- 担当も作った本人に戻す（他人が担当のまま見えなくなるのを防ぐ）。
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
    update todos
       set visibility = v_vis,
           assignee_member_id = case
             when v_vis = 'private' then created_by_member_id
             else assignee_member_id
           end
     where event_id = p_event_id;
    return;
  end if;

  insert into todos (trip_id, created_by_member_id, assignee_member_id, title, priority, kind, visibility, event_id)
  values (
    v_trip_id, v_creator, v_creator,
    to_char(v_start_at::date, 'FMMM/FMDD') || ' ' || v_title || 'の予約',
    'high', 'prep', v_vis, p_event_id
  );

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;


-- ゲストからの切り替え: 担当者も寄せる。作った人と担当者を1文で付け替える
-- （別々に付け替えると、自分だけの TODO で途中の状態が上の check に当たる）。
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
      -- expense_splits / event_participants / todo_likes は (親id, member_id) が
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

      update expenses set created_by_member_id = v_guest_member.id
       where created_by_member_id = v_mine_id;
      update expenses set payer_member_id = v_guest_member.id
       where payer_member_id = v_mine_id;
      update events set created_by_member_id = v_guest_member.id
       where created_by_member_id = v_mine_id;
      update places set created_by_member_id = v_guest_member.id
       where created_by_member_id = v_mine_id;
      update todos
         set created_by_member_id = case
               when created_by_member_id = v_mine_id then v_guest_member.id
               else created_by_member_id
             end,
             assignee_member_id = case
               when assignee_member_id = v_mine_id then v_guest_member.id
               else assignee_member_id
             end
       where created_by_member_id = v_mine_id or assignee_member_id = v_mine_id;
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
