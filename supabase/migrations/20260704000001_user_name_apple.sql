-- ────────────────────────────────────────────────────────────
-- サインアップ時の表示名を Apple ログインでも拾えるようにする
-- ────────────────────────────────────────────────────────────
-- Google の user_metadata は name / full_name の両方を持つが、Apple（Supabase GoTrue の
-- apple プロバイダ）は full_name のみ（しかも初回サインイン時だけ）。現行トリガーは
-- name しか見ておらず Apple では display_name が常に null になるため、
-- name → full_name の順で拾うよう拡張する。先頭トークン抽出・アバターの
-- avatar_url → picture フォールバック（Apple は写真を返さないので null のまま＝
-- 頭文字フォールバックが効く）は従来どおり。
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
      trim(coalesce(
        nullif(trim(new.raw_user_meta_data->>'name'), ''),
        new.raw_user_meta_data->>'full_name',
        ''
      )) from '^[^[:space:]　]+'
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
