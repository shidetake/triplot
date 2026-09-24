-- 管理ページの「アクティブユーザー数」。専用のトラッキングは持たず、
-- Supabase Auth が既に持っている auth.users.last_sign_in_at を読むだけ。
--
-- 「サインインした」であって「今この瞬間に開いている」ではない点に注意:
-- JWT のリフレッシュでは更新されず、明示的なサインイン（ログイン・匿名サイン
-- インでの新規参加）でのみ動く。継続利用の目安として使う。
--
-- 集計は public.users.is_anonymous を軸にする（ゲストの扱いは登録ユーザー数の
-- 表示と同じ定義に揃える）。ゲスト→本登録の昇格は public.users.is_anonymous を
-- 直接 false に落とすだけで auth.users 側は追随しない（guest_upgrade_tickets の
-- redeem_guest_upgrade_ticket 参照）ため、public.users を単一の真実にする。
create or replace function "public"."admin_active_user_counts"()
returns table("active_7d" bigint, "active_30d" bigint)
language "plpgsql" security definer
set "search_path" to 'public'
as $$
begin
  if not is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    count(*) filter (where au.last_sign_in_at >= now() - interval '7 days'),
    count(*) filter (where au.last_sign_in_at >= now() - interval '30 days')
  from auth.users au
  join public.users pu on pu.id = au.id
  where pu.is_anonymous = false;
end;
$$;

alter function "public"."admin_active_user_counts"() owner to "postgres";

revoke all on function "public"."admin_active_user_counts"() from public;
grant all on function "public"."admin_active_user_counts"() to "authenticated";
