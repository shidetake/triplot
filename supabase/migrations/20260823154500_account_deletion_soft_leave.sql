-- delete_account() の修正。
--
-- 墓標にしたメンバー行の left_at を立てていなかったため、退会済みの人が
-- 「アクティブメンバー」のまま残っていた。新しい費用の割り勘対象や
-- 「全員参加」の判定に含まれてしまう。
--
-- ソフト退会（left_at）はまさに「かつてメンバーだったが今は違う」を表す
-- 既存の概念なので、これを立てるのが正しい。既存の expense_splits 等は
-- member_id で参照していてアクティブ判定を見ないので、記録は壊れない。
-- あわせて is_admin も落とす（去った人が管理者のままなのはおかしい）。

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_trip_ids text[];
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
  --    left_at を立てる前に判定する（立てた後だと自分が候補から消える）。
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

  -- 4. 墓標をソフト退会にする。これをしないと、退会済みの人が割り勘の対象や
  --    「全員参加」の判定に残り続ける。
  update trip_members
     set left_at = coalesce(left_at, now()), is_admin = false
   where user_id = v_uid;

  -- 5. アバターの実体（avatars バケット）はここでは消せない。Supabase が
  --    storage.objects への直接 DELETE を禁じており、Storage API 経由で
  --    しか消せないため。呼び出し側がこの RPC の**前に**
  --    storage.from("avatars").remove() を実行する（RLS の avatars_delete_own
  --    で本人のパスだけ消せる）。先に消すのは、失敗したら中断してアカウントを
  --    残すため（逆順だと、消えたアカウントのアバターが取り残される）。

  -- 6. アカウント本体を消す。
  --    auth.users → public.users は CASCADE、public.users → trip_members は
  --    SET NULL なので、ここでメンバー行が墓標になる。
  delete from auth.users where id = v_uid;

  -- 7. 実アカウントが1人も残らなくなった旅行は誰からも開けないので消す。
  delete from trips t
   where t.id = any(v_trip_ids)
     and not exists (
       select 1 from trip_members m
        where m.trip_id = t.id and m.user_id is not null
     );
end;
$$;
