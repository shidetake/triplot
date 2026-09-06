-- アカウント削除と「旅行から抜ける」を分離する。
--
-- これまで delete_account() はメンバー行に left_at を立てていた。つまり
-- 「サービスを辞めた」と「その旅行に参加していない」が同じ状態に潰れていた。
--
-- 割り勘を動的にした（20260906000200）ことで、この違いが金額に効くようになる:
--
--   * 旅行から抜ける = 本当にその旅行に参加していない。以後の「全員で割り勘」
--     から外れるのが正しい（人数が減って計算し直される）。
--   * アカウント削除 = 旅行には参加していた。サービスを辞めるだけ。人数は
--     変わらないので、過去の割り勘の分け前も変わらない。
--
-- なので削除では left_at を立てず、メンバー行はアクティブのまま残す。
-- 名前だけ匿名化する（Slack・GitHub・Discord 等と同じ扱い。割り勘の相手を
-- 識別するのに本名は要らないので、消せるものは消す）。
--
-- 管理者の引き継ぎと is_admin を落とすのはそのまま（去った人が管理者のまま
-- なのはおかしい）。user_id は auth.users の削除で SET NULL になるので、
-- 誰もこのメンバーとして認証できない＝アクティブに残しても権限は生じない。

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
  delete from trips t
   where t.id = any(v_trip_ids)
     and not exists (
       select 1 from trip_members m
        where m.trip_id = t.id and m.user_id is not null
     );
end;
$$;
