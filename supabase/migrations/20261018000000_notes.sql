-- ノート（旅行の中に貯めておく雑多な情報やメモ）。
--
-- 中身はプレーンテキストだけで記法は持たない。1行目をタイトルとして扱うのは
-- 表示側の決まりで、DB は本文を1本の文字列として持つ。
--
-- 同時に編集したときに後から保存した方が黙って上書きしないよう、**期限付きの
-- ロック**を持つ（WordPress の記事の編集ロックと同じ形）。
--   - 編集に入る時に acquire_note_lock で取る。他の人が期限内に持っていれば
--     取れず、持っている人を返す。
--   - 編集中の端末は renew_note_lock で期限を延ばし続ける。止まって期限が
--     過ぎたロックは無いものとして扱う（強制終了・電波切れで残りっぱなしに
--     しない）。
--   - 取るたびに新しい lock_token を発行し、延長と保存はその token を持つ時だけ
--     通す。期限切れの間に他の人が取って保存した後で元の人が戻ってきても、
--     token が変わっているので古い内容で上書きしない。
--   - 他人のロックを奪う操作は置かない（期限切れを待てば外れる）。
--
-- 書き込みはすべて関数を通す（行への直接の insert/update/delete は RLS で
-- 通さない）。ロックの列を直接書き換えられると、ロックの意味が無くなるため。
-- lock_token は同じ旅行のメンバーには読めるが、鍵ではなく調停のための印
-- （読めるメンバーはそもそも編集できる）。

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null references public.trips(id) on delete cascade,
  created_by_member_id uuid not null references public.trip_members(id) on delete cascade,
  body text not null,
  visibility text not null default 'shared',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locked_by_member_id uuid references public.trip_members(id) on delete set null,
  lock_token uuid,
  lock_expires_at timestamptz,
  constraint notes_body_check check (btrim(body) <> ''),
  constraint notes_visibility_check check (visibility in ('shared', 'private'))
);

create index notes_trip_idx on public.notes (trip_id);

alter table public.notes enable row level security;

-- 読むだけのポリシー。書き込みは下の関数（security definer）だけが行う。
create policy notes_select on public.notes for select using (
  (visibility = 'shared' and is_active_trip_member(trip_id))
  or (visibility = 'private' and is_own_member(created_by_member_id))
);

-- ロックの期限。延長はこの何分の1かの間隔で行う（packages/shared の
-- NOTE_LOCK_RENEW_MS）。
create or replace function public.note_lock_lease() returns interval
  language sql immutable
  as $$ select interval '2 minutes' $$;

-- そのノートを今の人が読めるか（RLS の select と同じ規則）。
create or replace function public.can_see_note(p_note public.notes) returns boolean
  language sql stable security definer
  set search_path to 'public'
  as $$
    select (p_note.visibility = 'shared' and is_active_trip_member(p_note.trip_id))
        or (p_note.visibility = 'private' and is_own_member(p_note.created_by_member_id))
  $$;

create or replace function public.my_member_id(p_trip_id text) returns uuid
  language sql stable security definer
  set search_path to 'public'
  as $$
    select id from trip_members
     where trip_id = p_trip_id and user_id = auth.uid() and left_at is null
  $$;

create or replace function public.create_note(p_trip_id text, p_body text, p_visibility text) returns uuid
  language plpgsql security definer
  set search_path to 'public'
  as $$
declare
  v_me uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'body required';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;

  v_me := my_member_id(p_trip_id);
  if v_me is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  insert into notes (trip_id, created_by_member_id, body, visibility)
  values (p_trip_id, v_me, p_body, p_visibility)
  returning id into v_id;

  update trips set last_activity_at = now() where id = p_trip_id;
  return v_id;
end;
$$;

-- 編集に入る時に呼ぶ。取れたら token と、その時点の本文を返す（一覧で
-- 見ていた本文は古いかもしれないので、編集は必ずここで返す本文から始める）。
-- 他の人が期限内に持っていれば { ok: false, holder_member_id }。
create or replace function public.acquire_note_lock(p_note_id uuid) returns jsonb
  language plpgsql security definer
  set search_path to 'public'
  as $$
declare
  v_note  notes;
  v_me    uuid;
  v_token uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_note from notes where id = p_note_id for update;
  if not found or not can_see_note(v_note) then
    raise exception 'note not found' using errcode = '42501';
  end if;
  v_me := my_member_id(v_note.trip_id);
  if v_me is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  if v_note.locked_by_member_id is not null
     and v_note.locked_by_member_id <> v_me
     and v_note.lock_expires_at > now() then
    return jsonb_build_object('ok', false, 'holder_member_id', v_note.locked_by_member_id);
  end if;

  update notes
     set locked_by_member_id = v_me,
         lock_token = v_token,
         lock_expires_at = now() + note_lock_lease()
   where id = p_note_id;

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'body', v_note.body,
    'visibility', v_note.visibility
  );
end;
$$;

-- 編集中の端末が定期的に呼ぶ。token が変わっていたら（期限切れの間に他の人が
-- 取った）false。
create or replace function public.renew_note_lock(p_note_id uuid, p_token uuid) returns boolean
  language plpgsql security definer
  set search_path to 'public'
  as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  update notes
     set lock_expires_at = now() + note_lock_lease()
   where id = p_note_id and lock_token = p_token;
  return found;
end;
$$;

-- 保存してロックを外す（閉じた時）。token が変わっていた・ノートが消えていた
-- ときは何も書かずに false（呼び出し側が「保存できなかった」を出し、書きかけを
-- 手元に残せるようにする）。
create or replace function public.save_note(
  p_note_id uuid,
  p_token uuid,
  p_body text,
  p_visibility text
) returns boolean
  language plpgsql security definer
  set search_path to 'public'
  as $$
declare
  v_note notes;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'body required';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;

  select * into v_note from notes where id = p_note_id for update;
  if not found or v_note.lock_token is distinct from p_token then
    return false;
  end if;
  -- 自分だけにできるのは作った人だけ（他の人が自分だけにすると、作った人から
  -- 見えなくなる。予定・場所・費用は RLS の with check が同じことを守っている）。
  if p_visibility = 'private' and not is_own_member(v_note.created_by_member_id) then
    raise exception 'only the creator can make a note private' using errcode = '42501';
  end if;

  update notes
     set body = p_body,
         visibility = p_visibility,
         updated_at = case
                        when body = p_body and visibility = p_visibility then updated_at
                        else now()
                      end,
         locked_by_member_id = null,
         lock_token = null,
         lock_expires_at = null
   where id = p_note_id;

  update trips set last_activity_at = now() where id = v_note.trip_id;
  return true;
end;
$$;

-- 何も変えずに閉じた時。
create or replace function public.release_note_lock(p_note_id uuid, p_token uuid) returns void
  language plpgsql security definer
  set search_path to 'public'
  as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  update notes
     set locked_by_member_id = null, lock_token = null, lock_expires_at = null
   where id = p_note_id and lock_token = p_token;
end;
$$;

-- 消して、元の姿を返す（「元に戻す」で restore_note に渡す）。他の人が
-- 編集中のノートは消さない（その人の書きかけが行き場を失う）。
create or replace function public.delete_note_returning(p_id uuid) returns jsonb
  language plpgsql security definer
  set search_path to 'public'
  as $$
declare
  v_note notes;
  v_me   uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_note from notes where id = p_id for update;
  if not found or not can_see_note(v_note) then
    raise exception 'note not found' using errcode = '42501';
  end if;
  v_me := my_member_id(v_note.trip_id);
  if v_me is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;
  if v_note.locked_by_member_id is not null
     and v_note.locked_by_member_id <> v_me
     and v_note.lock_expires_at > now() then
    raise exception 'note is being edited' using errcode = '55P03';
  end if;

  delete from notes where id = p_id;
  return to_jsonb(v_note)
    || jsonb_build_object('locked_by_member_id', null, 'lock_token', null, 'lock_expires_at', null);
end;
$$;

create or replace function public.restore_note(p_snapshot jsonb) returns void
  language plpgsql security definer
  set search_path to 'public'
  as $$
declare
  v_note notes;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  v_note := jsonb_populate_record(
    null::notes,
    p_snapshot
      || jsonb_build_object('locked_by_member_id', null, 'lock_token', null, 'lock_expires_at', null)
  );
  if v_note.id is null or my_member_id(v_note.trip_id) is null or not can_see_note(v_note) then
    raise exception 'not a trip member' using errcode = '42501';
  end if;

  insert into notes select v_note.* on conflict (id) do nothing;
end;
$$;

revoke all on function public.can_see_note(public.notes) from public;
revoke all on function public.my_member_id(text) from public;
revoke all on function public.create_note(text, text, text) from public;
grant execute on function public.create_note(text, text, text) to authenticated;
revoke all on function public.acquire_note_lock(uuid) from public;
grant execute on function public.acquire_note_lock(uuid) to authenticated;
revoke all on function public.renew_note_lock(uuid, uuid) from public;
grant execute on function public.renew_note_lock(uuid, uuid) to authenticated;
revoke all on function public.save_note(uuid, uuid, text, text) from public;
grant execute on function public.save_note(uuid, uuid, text, text) to authenticated;
revoke all on function public.release_note_lock(uuid, uuid) from public;
grant execute on function public.release_note_lock(uuid, uuid) to authenticated;
revoke all on function public.delete_note_returning(uuid) from public;
grant execute on function public.delete_note_returning(uuid) to authenticated;
revoke all on function public.restore_note(jsonb) from public;
grant execute on function public.restore_note(jsonb) to authenticated;

-- アカウント削除: 本人にしか見えないノートも消す（step 1 に1行足しただけ。
-- 残りは 20260921130000 のまま）。
-- ゲストの引き継ぎ: ノートの作成者も寄せる（todos と同じ行に1行足しただけ。
-- 残りは 20261004010000 のまま）。

CREATE OR REPLACE FUNCTION "public"."delete_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_trip_ids text[];
  v_orphan_trip_ids text[];
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- 後始末の対象を、この人が所属していた旅行だけに限る
  -- （無関係な孤児データまで巻き込んで消さない）。
  select coalesce(array_agg(distinct trip_id), '{}')
    into v_trip_ids
    from trip_members where user_id = v_uid;

  -- 1. 本人にしか見えないコンテンツは消す（墓標に紐づいたまま残しても
  --    RLS 上どのアカウントからも到達できず、ゴミになるだけ）。
  delete from expenses e using trip_members m
   where e.created_by_member_id = m.id and m.user_id = v_uid and e.visibility = 'private';
  -- 消える予定自身が持つ外向きの tz_disambig_transit_id を先に外す
  -- （このすぐ下の DELETE と同じ対象行。消える行の値なので副作用は無い）。
  update events ev
     set tz_disambig_transit_id = null, tz_disambig_side = null
    from trip_members m
   where ev.created_by_member_id = m.id and m.user_id = v_uid and ev.visibility = 'private'
     and ev.tz_disambig_transit_id is not null;
  delete from events ev using trip_members m
   where ev.created_by_member_id = m.id and m.user_id = v_uid and ev.visibility = 'private';
  delete from places p using trip_members m
   where p.created_by_member_id = m.id and m.user_id = v_uid and p.visibility = 'private';
  delete from todos t using trip_members m
   where t.created_by_member_id = m.id and m.user_id = v_uid and t.visibility = 'private';
  delete from notes n using trip_members m
   where n.created_by_member_id = m.id and m.user_id = v_uid and n.visibility = 'private';

  -- 2. 取り込んだメールは本文が本人の個人データなので消す。
  delete from inbound_emails where user_id = v_uid;

  -- 3. 管理者の引き継ぎ。抜ける人が唯一の管理者だった旅行では、
  --    残る実アカウントのうち最古参を昇格させる（管理者不在にしない）。
  with orphaned as (
    select m.trip_id
      from trip_members m
     where m.user_id = v_uid and m.left_at is null and m.is_admin
       and not exists (
         select 1 from trip_members o
          where o.trip_id = m.trip_id and o.left_at is null and o.is_admin
            and o.user_id is not null and o.user_id <> v_uid
       )
  ), successor as (
    select distinct on (m.trip_id) m.id
      from trip_members m
      join orphaned o on o.trip_id = m.trip_id
     where m.left_at is null and m.user_id is not null and m.user_id <> v_uid
     order by m.trip_id, m.joined_at
  )
  update trip_members set is_admin = true
   where id in (select id from successor);

  -- 4. 名前を匿名化する。**left_at は立てない**（上のコメント参照）。
  --    既に自分で旅行から抜けていた行は、その left_at をそのまま残す。
  update trip_members
     set display_name = '退会したユーザー', is_admin = false
   where user_id = v_uid;

  -- 5. アバターの実体（avatars バケット）はここでは消せない。Supabase が
  --    storage.objects への直接 DELETE を禁じており、Storage API 経由で
  --    しか消せないため。呼び出し側がこの RPC の**前に**
  --    storage.from("avatars").remove() を実行する。
  -- 6. アカウント本体を消す。
  --    auth.users → public.users は CASCADE、public.users → trip_members は
  --    SET NULL なので、ここでメンバー行の user_id が外れる。
  delete from auth.users where id = v_uid;

  -- 7. 実アカウントが1人も残らなくなった旅行は誰からも開けないので消す。
  --    削除前に tz_disambig の自己参照を外しておく（delete_trip と同じ
  --    理由: events の BEFORE DELETE トリガが、同じ cascade で消える行を
  --    UPDATE しに行くと自己競合で失敗するため。実際にアカウント削除で
  --    この形の旅行を持つ場合に再現した）。
  select coalesce(array_agg(t.id), '{}')
    into v_orphan_trip_ids
    from trips t
   where t.id = any(v_trip_ids)
     and not exists (
       select 1 from trip_members m
        where m.trip_id = t.id and m.user_id is not null
     );

  perform clear_trip_tz_disambig(v_orphan_trip_ids);

  delete from trips where id = any(v_orphan_trip_ids);
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
      -- trip_members を参照する外部キーは 9 本が ON DELETE CASCADE なので、
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
      update notes set created_by_member_id = v_guest_member.id
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
