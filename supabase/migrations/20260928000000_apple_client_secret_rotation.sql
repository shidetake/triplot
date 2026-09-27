-- web の「Apple でログイン」の client secret（最長6か月）を自動で作り直す仕組み。
-- 作り直す本体は Edge Function の rotate-apple-client-secret。ここはその
-- 記録と、週1回の呼び出し。
--
-- Supabase は入れた client secret を読み返させない（ハッシュしか返さない）ので、
-- いつ入れ替えたかは自分で記録する。

-- 入れ替えの記録。1回ごとに1行（履歴として残す）。
-- 管理者は読める（docs/database.md「データを誰に読ませるか」: 運営のための
-- 記録）。書くのは Edge Function（service role）だけ。
create table "public"."apple_client_secret_rotations" (
  "id" uuid primary key default gen_random_uuid(),
  "rotated_at" timestamptz not null default now(),
  "expires_at" timestamptz not null
);

alter table "public"."apple_client_secret_rotations" enable row level security;

create policy "admin can read apple secret rotations"
  on "public"."apple_client_secret_rotations"
  for select to authenticated
  using (is_app_admin());

-- 週1回の呼び出し。呼び先の URL は Vault の apple_secret_rotation_url に置く
-- （プロジェクトごとに違うため）。**置いていない環境では何もしない**ので、
-- Apple ログインを使っていない staging では動かない。
create extension if not exists "pg_cron" with schema "pg_catalog";

create function "public"."invoke_apple_client_secret_rotation"()
returns void
language "plpgsql" security definer
set "search_path" to 'public'
as $$
declare
  target text;
begin
  select decrypted_secret into target
    from vault.decrypted_secrets
   where name = 'apple_secret_rotation_url';
  if target is null then
    return;
  end if;

  perform net.http_post(
    url := target,
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

alter function "public"."invoke_apple_client_secret_rotation"() owner to "postgres";

revoke all on function "public"."invoke_apple_client_secret_rotation"() from public;
revoke all on function "public"."invoke_apple_client_secret_rotation"() from "anon", "authenticated";

-- 毎週月曜 03:00 UTC。作り直すかどうかは Edge Function が決める
-- （前回から150日経った時だけ）。
select cron.schedule(
  'rotate-apple-client-secret',
  '0 3 * * 1',
  $$select public.invoke_apple_client_secret_rotation()$$
);
