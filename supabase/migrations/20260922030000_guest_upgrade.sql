-- ゲスト（匿名サインイン）から本アカウントへの昇格。
--
-- これまでは、ゲストで参加した人が後から Google / Apple でログインすると
-- **別のユーザー**になり、旅行が1つも見えなかった。招待リンクを踏み直せば参加は
-- できるが、同じ旅行に2人目のメンバーとして入るので精算が2人分に割れる。さらに
-- 匿名ユーザーにはサインインし直す手段が無いため、ログアウトすると旅行を失う。
--
-- 方式は「引き換え券 → 通常のサインイン → 引き取り」の1本道。Supabase の
-- linkIdentity() は OAuth のリダイレクト前提で、ネイティブアプリが使っている
-- id_token サインインと噛み合わないため使わない。券を挟むことで、サインインで
-- セッションがゲストから新しいアカウントに切り替わった後でも「さっきのゲストは
-- 自分だった」と示せる。そのアカウントが既にあるかどうかで分岐しないので、
-- 初めてのアカウントも既存のアカウントも同じ経路で片付く。
--
-- 中身（費用・予定・場所・TODO・割り勘・いいね）はすべて trip_members.id に
-- ぶら下がっているので、メンバー行の user_id を差し替えるだけで付いてくる。

create table if not exists "public"."guest_upgrade_tickets" (
    "token" "text" not null,
    "guest_user_id" "uuid" not null,
    "created_at" timestamp with time zone default "now"() not null,
    "expires_at" timestamp with time zone not null,
    "used_at" timestamp with time zone
);

alter table only "public"."guest_upgrade_tickets"
    add constraint "guest_upgrade_tickets_pkey" primary key ("token");

alter table only "public"."guest_upgrade_tickets"
    add constraint "guest_upgrade_tickets_guest_user_id_fkey"
    foreign key ("guest_user_id") references "public"."users"("id") on delete cascade;

create index if not exists "guest_upgrade_tickets_guest_idx"
    on "public"."guest_upgrade_tickets" using "btree" ("guest_user_id");

alter table "public"."guest_upgrade_tickets" owner to "postgres";

-- ポリシーを1本も置かない＝クライアントからは直接読めない・書けない。
-- 発行も引き換えも下の SECURITY DEFINER 関数だけを通す（券を総当たりで
-- 引ける経路を作らないため）。
alter table "public"."guest_upgrade_tickets" enable row level security;

grant all on table "public"."guest_upgrade_tickets" to "anon";
grant all on table "public"."guest_upgrade_tickets" to "authenticated";
grant all on table "public"."guest_upgrade_tickets" to "service_role";


-- 引き換え券を発行する。ゲスト（匿名）本人からのみ。
create or replace function "public"."create_guest_upgrade_ticket"() returns "text"
    language "plpgsql" security definer
    set "search_path" to 'public'
    as $$
declare
  v_uid   uuid := auth.uid();
  v_anon  boolean;
  v_token text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select is_anonymous into v_anon from users where id = v_uid;
  if not coalesce(v_anon, false) then
    raise exception 'not a guest' using errcode = '42501';
  end if;

  -- 出しっぱなしの券を残さない（押し直した時に前の券を無効化する）。
  delete from guest_upgrade_tickets where guest_user_id = v_uid and used_at is null;

  v_token := public.nanoid(32);
  insert into guest_upgrade_tickets (token, guest_user_id, expires_at)
  values (v_token, v_uid, now() + interval '30 minutes');

  return v_token;
end;
$$;

alter function "public"."create_guest_upgrade_ticket"() owner to "postgres";


-- 券を引き換えて、ゲストの持ち物を呼び出し元のアカウントへ移す。
-- 引き換え後、ゲストのユーザーは消える。
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

alter function "public"."redeem_guest_upgrade_ticket"("p_token" "text") owner to "postgres";


revoke all on function "public"."create_guest_upgrade_ticket"() from public;
grant all on function "public"."create_guest_upgrade_ticket"() to "authenticated";

revoke all on function "public"."redeem_guest_upgrade_ticket"("p_token" "text") from public;
grant all on function "public"."redeem_guest_upgrade_ticket"("p_token" "text") to "authenticated";
