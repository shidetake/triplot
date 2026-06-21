-- ────────────────────────────────────────────────────────────
-- サインアップ時に OAuth（Google 等）のアバターを users.avatar_url へコピーする
-- ────────────────────────────────────────────────────────────
-- 表示名(display_name)と同じ「登録時に一発コピー・追従なし」方針（Google 側で写真を変えても追従しない）。
-- 目的: 他メンバーからもアバター写真を見せるため。Google 写真は各ユーザーの auth メタデータにしか
-- 無く本人しか参照できないので、queryable な public.users にコピーしておく必要がある。
-- カスタムアップロードは後から avatar_url を上書きするだけ（コピーは二度と走らないので競合しない）。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, is_anonymous, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.is_anonymous, false),
    -- フルネームの先頭の非空白トークン（半角/全角スペース区切り）。無ければ null。
    substring(
      trim(coalesce(new.raw_user_meta_data->>'name', '')) from '^[^[:space:]　]+'
    ),
    -- OAuth プロバイダのアバター URL（Google は avatar_url / picture のどちらか）。
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
