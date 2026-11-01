-- ユーザー一覧の「最終利用」から、AI（MCP のクライアント）のセッションを除く。
--
-- 最終利用は「最後にログインした日」と「セッションが最後に更新された日」の新しい
-- 方で、AI との連携も同じセッションの仕組み（auth.sessions。oauth_client_id が
-- 入っている）を使う。そのままだと AI が triplot を使っただけで本人の最終利用が
-- 動くので、本人がアプリか web を使った日だけにする。AI の最終利用は
-- admin_ai_connections が連携ごとに返す。
--
-- 返す列は変えないので置き換えだけ。各列の定義は
-- 20260927000000_admin_user_usage_drop_provider.sql を参照。
create or replace function "public"."admin_user_usage"()
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
      (select max(s.updated_at) from auth.sessions s
        where s.user_id = pu.id and s.oauth_client_id is null)
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
