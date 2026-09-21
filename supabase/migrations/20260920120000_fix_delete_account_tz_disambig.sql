-- delete_account() で「移動の予定＋それを参照する予定/費用」を持つ旅行が
-- 消せなくなる不具合の修正。
--
-- delete_trip() は既に同じ問題（events の BEFORE DELETE トリガが、同じ cascade
-- で消える行を UPDATE しに行き自己競合する）への回避策を持っていた
-- （trip_id の予定・費用の tz_disambig を先に UPDATE で外してから DELETE する）
-- が、delete_account() の「実アカウントが居なくなった旅行を消す」処理には
-- この回避策が入っておらず、同じ形の旅行を持つアカウントの削除が失敗していた
-- （packages/shared/dbtests/tripLifecycle.test.ts のコメント参照）。
--
-- 重複を避けるため、回避策を共通関数に括り出して両方から呼ぶ。

CREATE OR REPLACE FUNCTION "public"."clear_trip_tz_disambig"("p_trip_ids" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update events
     set tz_disambig_transit_id = null, tz_disambig_side = null
   where trip_id = any(p_trip_ids) and tz_disambig_transit_id is not null;

  update expenses
     set tz_disambig_transit_id = null, tz_disambig_side = null
   where trip_id = any(p_trip_ids) and tz_disambig_transit_id is not null;
end;
$$;

ALTER FUNCTION "public"."clear_trip_tz_disambig"("p_trip_ids" "text"[]) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."clear_trip_tz_disambig"("p_trip_ids" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_trip_tz_disambig"("p_trip_ids" "text"[]) TO "authenticated";


CREATE OR REPLACE FUNCTION "public"."delete_trip"("p_trip_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- RLS の trips_member_delete と同じ条件（管理者のみ）。
  if not is_trip_admin(p_trip_id) then
    raise exception 'admin required' using errcode = '42501';
  end if;

  perform clear_trip_tz_disambig(array[p_trip_id]);

  delete from trips where id = p_trip_id;
end;
$$;


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
  delete from events ev using trip_members m
   where ev.created_by_member_id = m.id and m.user_id = v_uid and ev.visibility = 'private';
  delete from places p using trip_members m
   where p.created_by_member_id = m.id and m.user_id = v_uid and p.visibility = 'private';
  delete from todos t using trip_members m
   where t.created_by_member_id = m.id and m.user_id = v_uid and t.visibility = 'private';

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
