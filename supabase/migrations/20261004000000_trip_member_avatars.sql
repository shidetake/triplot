-- 同じ旅行のメンバーの写真の URL を返す。
--
-- users は本人と管理者しか読めない（メール取り込みの鍵 import_token や
-- Google の ID が入っているため、行ごと他人に読ませない）。そのため旅行の
-- 詳細で他のメンバーの写真を users から引くと、管理者以外には空で返り、
-- 一般の利用者には他のメンバーがずっと頭文字で表示されていた。
--
-- 写真の URL だけを、その旅行の在籍メンバーにだけ返す。写真の実体は公開の
-- avatars バケット（または Google の公開 URL）なので、URL を渡せば表示できる。
create or replace function public.trip_member_avatars(p_trip_id text)
returns table (member_id uuid, avatar_url text)
    language sql stable security definer
    set search_path to 'public'
    as $$
  select m.id, u.avatar_url
    from trip_members m
    join users u on u.id = m.user_id
   where m.trip_id = p_trip_id
     and u.avatar_url is not null
     and is_active_trip_member(p_trip_id);
$$;

revoke all on function public.trip_member_avatars(text) from public;
grant execute on function public.trip_member_avatars(text) to authenticated;
