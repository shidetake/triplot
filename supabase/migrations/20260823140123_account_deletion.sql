-- アプリ内でのアカウント削除（App Store Review Guideline 5.1.1(v)）。
--
-- ■ なぜメンバー行を残すのか
--   trip_members.user_id は users に ON DELETE CASCADE で繋がっていて、
--   そこから places / events / expenses / expense_splits / todos が
--   すべて CASCADE で連鎖する。このまま users を消すと、**他のメンバーの
--   旅行から共有コンテンツが消え、expense_splits が欠けて残った人の割り勘
--   計算が壊れる**。
--
--   trip_members は display_name と color を自分で持っているので、user_id を
--   外しても「旅行の中で誰か」は表示し続けられる。そこで user_id を nullable
--   + ON DELETE SET NULL にして、メンバー行を墓標として残す。共有した記録は
--   その場にいた全員のものなので残し、アカウントとの紐付けだけを切る。
--
--   RLS ヘルパー（is_active_trip_member / is_own_member / is_trip_admin）は
--   いずれも exists(... user_id = auth.uid()) なので、user_id が NULL の行は
--   マッチしない＝墓標は誰にもアクセス権を与えない。ヘルパー側の変更は不要。

alter table public.trip_members
  alter column user_id drop not null;

alter table public.trip_members
  drop constraint trip_members_user_id_fkey;

alter table public.trip_members
  add constraint trip_members_user_id_fkey
  foreign key (user_id) references public.users(id) on delete set null;

-- 墓標かどうかの判定に使う（一覧の取得で毎回引くため）
create index if not exists trip_members_active_account_idx
  on public.trip_members (trip_id)
  where user_id is not null;


-- 呼び出し元のアカウントを削除する。
-- 複数テーブルに RLS 配下で atomic に書くので SECURITY DEFINER RPC にする
-- （AGENTS.md「複数行書き込みは SECURITY DEFINER RPC で」）。
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

  -- 2. 取り込んだメールは本文が本人の個人データなので消す
  --    （FK は SET NULL だが、残す理由がない）。
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

  -- 4. アバターの実体（avatars バケット）はここでは消せない。Supabase が
  --    storage.objects への直接 DELETE を禁じており、Storage API 経由で
  --    しか消せないため。呼び出し側がこの RPC の**前に**
  --    storage.from("avatars").remove() を実行する（RLS の avatars_delete_own
  --    で本人のパスだけ消せる）。先に消すのは、失敗したら中断してアカウントを
  --    残すため（逆順だと、消えたアカウントのアバターが取り残される）。

  -- 5. アカウント本体を消す。
  --    auth.users → public.users は CASCADE、public.users → trip_members は
  --    上で SET NULL に変えたので、ここでメンバー行が墓標になる。
  delete from auth.users where id = v_uid;

  -- 6. 実アカウントが1人も残らなくなった旅行は誰からも開けないので消す
  --    （trips から先は CASCADE で落ちる）。
  delete from trips t
   where t.id = any(v_trip_ids)
     and not exists (
       select 1 from trip_members m
        where m.trip_id = t.id and m.user_id is not null
     );
end;
$$;

alter function public.delete_account() owner to postgres;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;

comment on function public.delete_account() is
  'アカウントを削除する。共有コンテンツは trip_members を墓標として残すことで保全し、'
  'private なコンテンツ・取り込みメール・アバター・アカウント本体を消す。';
