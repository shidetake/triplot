-- ユーザー一覧にメールアドレスとログイン方法を足す。表示名が空の人もいて、
-- 表示名だけでは誰か見分けられないため（プライバシーポリシーの利用目的に
-- 「名前とメールアドレスは運営〔利用状況の把握〕にも使う」と明記済み）。
--
-- - email: アカウントに登録されたメールアドレス（1アカウントに1つ）。Apple で
--   「メールを非公開」を選んだ人は Apple が発行する転送用アドレスになる。
-- - provider: ログイン方法（google / apple）。1アカウントに1つ（Google と Apple の
--   両方で入った人は別々のアカウントになる）。
--
-- 返す列が変わるので作り直す。呼んでいるのは web の管理ページだけ。
-- それ以外の列の定義は 20260925000000_admin_user_usage.sql を参照。
drop function if exists "public"."admin_user_usage"();

create function "public"."admin_user_usage"()
returns table (
  "user_id" uuid,
  "display_name" text,
  "email" text,
  "provider" text,
  "registered_at" timestamptz,
  "last_active_at" timestamptz,
  "trip_count" bigint,
  "imports_this_month" bigint,
  "failed_count" bigint,
  "cap_override" integer
)
language "plpgsql" stable security definer
set "search_path" to 'public'
as $$
begin
  if not is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    pu.id,
    pu.display_name,
    au.email::text,
    au.raw_app_meta_data ->> 'provider',
    pu.created_at,
    greatest(
      au.last_sign_in_at,
      (select max(s.updated_at) from auth.sessions s where s.user_id = pu.id)
    ),
    (select count(*) from public.trip_members tm
      where tm.user_id = pu.id and tm.left_at is null),
    (select count(*) from public.inbound_emails ie
      where ie.user_id = pu.id
        and ie.extracted_at >= (date_trunc('month', now() at time zone 'utc') at time zone 'utc')),
    (select count(*) from public.inbound_emails ie
      where ie.user_id = pu.id and ie.status = 'error'),
    pu.monthly_email_cap_override
  from public.users pu
  join auth.users au on au.id = pu.id
  where pu.is_anonymous = false;
end;
$$;

alter function "public"."admin_user_usage"() owner to "postgres";

revoke all on function "public"."admin_user_usage"() from public;
grant all on function "public"."admin_user_usage"() to "authenticated";
