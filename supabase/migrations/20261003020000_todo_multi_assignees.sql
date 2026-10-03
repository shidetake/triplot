-- TODO の担当を「未定／全員／一部」にし、完了を一人ずつ記録する。
--
-- 担当（予定の参加者・費用の割り勘と同じ形）:
--   未定 = assignee_everyone = false かつ todo_assignees が空 … 誰か1人がやれば完了
--   全員 = assignee_everyone = true                         … 在籍メンバー全員がやれば完了
--   一部 = assignee_everyone = false かつ todo_assignees あり … その人たちがやれば完了
-- 「全員」はフラグで持ち、その時点の在籍メンバーに解決する（後から入った人も
-- 対象になり、抜けた人は外れる）。数える対象からはアカウントを削除した
-- メンバー（user_id が NULL）を除く。もうチェックできないので、入れると
-- 永遠に完了しなくなる。
--
-- 完了は todo_completions に一人ずつ記録する。todos.done は「TODO 全体が完了
-- したか」で、DB が上の規則で計算し直す（クライアントは読むだけ）。配布済みの
-- アプリは todos.done を直接書き換えるので、それは「その人がやった記録」に
-- 読み替える。
--
-- 20261002000000 で入れた assignee_member_id は使わなくなる。配布済みの
-- 試験版が読むので、担当が1人のときだけ値を合わせておき、段階を踏んで消す。

alter table public.todos
  add column assignee_everyone boolean not null default false;

create table public.todo_assignees (
  todo_id   uuid not null references public.todos (id) on delete cascade,
  member_id uuid not null references public.trip_members (id) on delete cascade,
  primary key (todo_id, member_id)
);
create index todo_assignees_member_idx on public.todo_assignees using btree (member_id);

create table public.todo_completions (
  todo_id      uuid not null references public.todos (id) on delete cascade,
  member_id    uuid not null references public.trip_members (id) on delete cascade,
  completed_at timestamp with time zone not null default now(),
  primary key (todo_id, member_id)
);
create index todo_completions_member_idx on public.todo_completions using btree (member_id);

-- 既存データ: 担当1人はその人を一部の担当に、完了済みは担当（未定なら作った人）
-- のやった記録にする。トリガを作る前に入れる（入れる途中で done を計算し直さない）。
insert into public.todo_completions (todo_id, member_id)
select id, coalesce(assignee_member_id, created_by_member_id)
  from public.todos where done;

insert into public.todo_assignees (todo_id, member_id)
select id, assignee_member_id from public.todos where assignee_member_id is not null;


-- その TODO 全体が完了しているか（上の規則）。トリガとクライアント互換の読み替えが使う。
create or replace function public.todo_is_done(p_todo_id uuid, p_trip_id text, p_everyone boolean)
returns boolean
    language plpgsql stable security definer
    set search_path to 'public'
    as $$
declare
  v_required int;
  v_done     int;
begin
  if p_everyone then
    select count(*), count(c.member_id) into v_required, v_done
      from trip_members m
      left join todo_completions c on c.todo_id = p_todo_id and c.member_id = m.id
     where m.trip_id = p_trip_id and m.left_at is null and m.user_id is not null;
  elsif not exists (select 1 from todo_assignees where todo_id = p_todo_id) then
    -- 未定: 誰か1人がやれば完了。
    return exists (select 1 from todo_completions where todo_id = p_todo_id);
  else
    select count(*), count(c.member_id) into v_required, v_done
      from todo_assignees a
      join trip_members m on m.id = a.member_id and m.left_at is null and m.user_id is not null
      left join todo_completions c on c.todo_id = a.todo_id and c.member_id = a.member_id
     where a.todo_id = p_todo_id;
  end if;
  -- 担当が全員いなくなった（抜けた・退会した）ときは、誰かがやっていれば完了。
  if v_required = 0 then
    return exists (select 1 from todo_completions where todo_id = p_todo_id);
  end if;
  return v_done = v_required;
end;
$$;

-- その人がこの TODO をチェックしてよいか（未定なら誰でも、それ以外は担当だけ）。
create or replace function public.can_complete_todo(p_todo_id uuid, p_member_id uuid)
returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select exists (
    select 1 from todos t
     where t.id = p_todo_id
       and (
         t.assignee_everyone
         or not exists (select 1 from todo_assignees a where a.todo_id = t.id)
         or exists (select 1 from todo_assignees a where a.todo_id = t.id and a.member_id = p_member_id)
       )
  );
$$;


-- todos.done を計算し直す。完了・担当が変わった時に呼ぶ。トリガの入れ子
-- （pg_trigger_depth() > 1）の時は呼び出し元が計算するので何もしない。
create or replace function public.todo_refresh_done_trigger() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_todo_id uuid := coalesce(new.todo_id, old.todo_id);
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  update todos t
     set done = todo_is_done(t.id, t.trip_id, t.assignee_everyone)
   where t.id = v_todo_id;
  return null;
end;
$$;

create trigger todo_completions_refresh_done
  after insert or delete on public.todo_completions
  for each row execute function public.todo_refresh_done_trigger();

create trigger todo_assignees_refresh_done
  after insert or delete on public.todo_assignees
  for each row execute function public.todo_refresh_done_trigger();


-- todos を直接更新した時（クライアントからの文）。
--   ・done の書き換えは、配布済みのアプリのチェック。その人のやった記録に読み替える
--     （担当でなければ記録しない）。
--   ・どの更新でも done は規則から計算し直す（担当のフラグが変わった時も含む）。
create or replace function public.todos_before_update() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_me uuid;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.done is distinct from old.done then
    select id into v_me
      from trip_members
     where trip_id = new.trip_id and user_id = auth.uid() and left_at is null;
    if v_me is not null then
      if new.done then
        if can_complete_todo(new.id, v_me) then
          insert into todo_completions (todo_id, member_id)
          values (new.id, v_me) on conflict do nothing;
        end if;
      else
        delete from todo_completions where todo_id = new.id and member_id = v_me;
      end if;
    end if;
  end if;

  new.done := todo_is_done(new.id, new.trip_id, new.assignee_everyone);
  return new;
end;
$$;

create trigger todos_before_update
  before update on public.todos
  for each row execute function public.todos_before_update();


-- メンバーの出入り（参加・抜ける・戻る・退会）で、全員・一部の完了が変わる。
-- 退会は外部キーの SET NULL（トリガの入れ子）で来るので、入れ子でも計算する
-- （todos 側のトリガは入れ子では何もしないので、ここから先は連鎖しない）。
create or replace function public.trip_members_refresh_todos() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
begin
  update todos t
     set done = todo_is_done(t.id, t.trip_id, t.assignee_everyone)
   where t.trip_id = coalesce(new.trip_id, old.trip_id)
     and t.done is distinct from todo_is_done(t.id, t.trip_id, t.assignee_everyone);
  return null;
end;
$$;

create trigger trip_members_refresh_todos
  after insert or update of left_at, user_id on public.trip_members
  for each row execute function public.trip_members_refresh_todos();


-- 権限: 読むのは TODO が見える人。担当は RPC（set_todo_assignees）だけが書く。
-- 完了は自分の分だけ、担当（未定なら誰でも）のときだけ付けられる。
alter table public.todo_assignees enable row level security;
alter table public.todo_completions enable row level security;

create policy todo_assignees_select on public.todo_assignees for select
  using (exists (select 1 from public.todos t where t.id = todo_assignees.todo_id));

create policy todo_completions_select on public.todo_completions for select
  using (exists (select 1 from public.todos t where t.id = todo_completions.todo_id));

create policy todo_completions_insert on public.todo_completions for insert
  with check (
    exists (select 1 from public.todos t where t.id = todo_completions.todo_id)
    and exists (
      select 1 from public.trip_members m
       where m.id = todo_completions.member_id
         and m.user_id = auth.uid() and m.left_at is null
    )
    and public.can_complete_todo(todo_completions.todo_id, todo_completions.member_id)
  );

create policy todo_completions_delete on public.todo_completions for delete
  using (
    exists (
      select 1 from public.trip_members m
       where m.id = todo_completions.member_id and m.user_id = auth.uid()
    )
  );

grant select, insert, delete on public.todo_assignees to authenticated;
grant select, insert, delete on public.todo_completions to authenticated;
grant all on public.todo_assignees to service_role;
grant all on public.todo_completions to service_role;


-- 担当を変える。未定は (false, 空)、全員は (true, -)、一部は (false, メンバー)。
-- 自分だけの TODO の担当は作った本人に決まっているので変えさせない。
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
     set assignee_everyone = coalesce(p_everyone, false),
         assignee_member_id = case
           when not coalesce(p_everyone, false) and array_length(v_ids, 1) = 1 then v_ids[1]
           else null
         end
   where id = p_todo_id;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;

revoke all on function public.set_todo_assignees(uuid, boolean, uuid[]) from public;
grant all on function public.set_todo_assignees(uuid, boolean, uuid[]) to authenticated;


-- 消して控えを返す / 控えから戻す。担当とやった記録も控えに入れる。
create or replace function public.delete_todo_returning(p_id uuid) returns jsonb
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_uid         uuid := auth.uid();
  v_todo        jsonb;
  v_likes       jsonb;
  v_assignees   jsonb;
  v_completions jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select to_jsonb(t) into v_todo
  from todos t
  where t.id = p_id and is_active_trip_member(t.trip_id);
  if v_todo is null then
    raise exception 'todo not found' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(l.member_id), '[]'::jsonb) into v_likes
  from todo_likes l where l.todo_id = p_id;
  select coalesce(jsonb_agg(a.member_id), '[]'::jsonb) into v_assignees
  from todo_assignees a where a.todo_id = p_id;
  select coalesce(jsonb_agg(jsonb_build_object('member_id', c.member_id, 'completed_at', c.completed_at)), '[]'::jsonb)
    into v_completions
  from todo_completions c where c.todo_id = p_id;

  delete from todos where id = p_id;
  return jsonb_build_object(
    'todo', v_todo, 'likes', v_likes,
    'assignees', v_assignees, 'completions', v_completions
  );
end;
$$;

create or replace function public.restore_todo(p_snapshot jsonb) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_uid  uuid := auth.uid();
  v_todo jsonb := p_snapshot -> 'todo';
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_todo is null then
    raise exception 'invalid snapshot';
  end if;
  if not is_active_trip_member(v_todo ->> 'trip_id') then
    raise exception 'not a trip member' using errcode = '42501';
  end if;
  v_id := (v_todo ->> 'id')::uuid;

  -- 控え以前の版には assignee_everyone が無いので、既定値を下に敷く。
  insert into todos
  select * from jsonb_populate_record(
    null::todos,
    jsonb_build_object('assignee_everyone', false) || v_todo
  )
  on conflict (id) do nothing;

  insert into todo_likes (todo_id, member_id)
  select v_id, m::uuid
  from jsonb_array_elements_text(coalesce(p_snapshot -> 'likes', '[]'::jsonb)) m
  on conflict do nothing;

  -- 抜けた・消えたメンバーの行は外部キーで入らないので、残っている人だけ戻す。
  insert into todo_assignees (todo_id, member_id)
  select v_id, m::uuid
  from jsonb_array_elements_text(coalesce(p_snapshot -> 'assignees', '[]'::jsonb)) m
  where exists (select 1 from trip_members tm where tm.id = m::uuid)
  on conflict do nothing;

  insert into todo_completions (todo_id, member_id, completed_at)
  select v_id, (c ->> 'member_id')::uuid, (c ->> 'completed_at')::timestamptz
  from jsonb_array_elements(coalesce(p_snapshot -> 'completions', '[]'::jsonb)) c
  where exists (select 1 from trip_members tm where tm.id = (c ->> 'member_id')::uuid)
  on conflict do nothing;

  -- 控え以前の版（assignees を持たない）から戻すときは、作った人を担当にする。
  if not (p_snapshot ? 'assignees') then
    insert into todo_assignees (todo_id, member_id)
    select v_id, (v_todo ->> 'created_by_member_id')::uuid
    on conflict do nothing;
  end if;
end;
$$;


-- 作成: 担当の初期値は作った人（一部・1人）。
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

  -- 担当の初期値は作った人（一部・1人）。
  insert into todo_assignees (todo_id, member_id) values (v_todo_id, v_my_member_id);

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_todo_id;
end;
$$;


-- 予約TODO: 担当の初期値は予定を作った人。
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
    update todos
       set visibility = v_vis,
           assignee_member_id = case
             when v_vis = 'private' then created_by_member_id
             else assignee_member_id
           end
     where event_id = p_event_id;
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

  insert into todos (trip_id, created_by_member_id, assignee_member_id, title, priority, kind, visibility, event_id)
  values (
    v_trip_id, v_creator, v_creator,
    to_char(v_start_at::date, 'FMMM/FMDD') || ' ' || v_title || 'の予約',
    'high', 'prep', v_vis, p_event_id
  )
  returning id into v_todo_id;

  insert into todo_assignees (todo_id, member_id) values (v_todo_id, v_creator);

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;


-- ゲストからの切り替え: 担当とやった記録も寄せる。
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
