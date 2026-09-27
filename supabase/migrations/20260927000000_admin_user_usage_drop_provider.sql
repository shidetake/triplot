-- ユーザー一覧の古い列 provider を消す。
--
-- 20260926000000_admin_user_usage_providers.sql で、付いているログイン方法すべてを
-- 返す providers を足し、本番で動いていた管理ページのために provider を残していた。
-- providers を読む管理ページが本番に出たので、provider はもう誰も読まない。
--
-- 返す列が変わるので作り直す。呼んでいるのは web の管理ページだけ。
-- 各列の定義は 20260925000000_admin_user_usage.sql /
-- 20260925020000_admin_user_usage_email.sql / 20260926000000_admin_user_usage_providers.sql を参照。
drop function if exists "public"."admin_user_usage"();

create function "public"."admin_user_usage"()
returns table (
  "user_id" uuid,
  "display_name" text,
  "email" text,
  "providers" text[],
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
    (select array_agg(distinct i.provider order by i.provider)
       from auth.identities i where i.user_id = pu.id),
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
