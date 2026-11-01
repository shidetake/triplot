-- AI（MCP のクライアント）との連携ごとに、最後に使われた日時を記録する。
--
-- 連携の一覧（Supabase の OAuth の許可）は、AI 側でコネクタを消しても残る
-- （ChatGPT で実際に起きた）。最後に使った日を出せば、利用者が使っていない
-- 連携を見分けて解除できる。Supabase は許可ごとの使用日時を持っていない
-- （AI のセッションの更新時刻は、トークンを更新した時にしか動かない）ので、
-- MCP サーバーが AI から呼ばれるたびに書く。
--
-- **連携の相手（client_id）は外部キーにしない。** 指す先は auth の内部の表
-- （auth.oauth_clients）で、そちらの作りは Supabase が変える。解除した連携の行は
-- 残っても害が無い（解除後に同じ AI をつなぎ直すと別の client_id になる）。
--
-- 読めるのは本人と管理者（docs/database.md「データを誰に読ませるか」）。
-- 管理者は連携の一覧と合わせて admin_ai_connections から読む。

create table public.ai_client_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null,
  last_used_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

alter table public.ai_client_usage enable row level security;

create policy ai_client_usage_select_own on public.ai_client_usage
  for select using (user_id = auth.uid());
create policy ai_client_usage_insert_own on public.ai_client_usage
  for insert with check (user_id = auth.uid());
create policy ai_client_usage_update_own on public.ai_client_usage
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_client_usage_admin_select on public.ai_client_usage
  for select using (is_app_admin());

grant select, insert, update on table public.ai_client_usage to authenticated;

-- 管理ページのユーザー一覧に出す、今つながっている AI と最後に使った日。
-- 連携の一覧は auth の表にしかなく、管理者でも RLS では読めないので、
-- 管理者かを入口で確かめる SECURITY DEFINER の関数で返す（admin_user_usage と同じ形）。
create function public.admin_ai_connections()
returns table (
  user_id uuid,
  client_name text,
  granted_at timestamptz,
  last_used_at timestamptz
)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  if not is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select k.user_id, c.client_name, k.granted_at, u.last_used_at
  from auth.oauth_consents k
  join auth.oauth_clients c on c.id = k.client_id
  left join public.ai_client_usage u
    on u.user_id = k.user_id and u.client_id = k.client_id
  where k.revoked_at is null and c.deleted_at is null;
end;
$$;

alter function public.admin_ai_connections() owner to postgres;

revoke all on function public.admin_ai_connections() from public;
grant all on function public.admin_ai_connections() to authenticated;
