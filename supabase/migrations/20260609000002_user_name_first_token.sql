-- ────────────────────────────────────────────────────────────
-- 既定の表示名は「Google フルネームの先頭トークンだけ」を保存する
-- ────────────────────────────────────────────────────────────
-- 以前はフルネームを保存し、表示側で先頭トークンを切り出していた（後半が消える挙動が
-- 分かりにくかった）。保存時点で短くしておけば、旅行作成の既定名はそのまま使えて、
-- 設定での名前編集もそのまま効く。後半トークンは保存しない。

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, is_anonymous, display_name)
  values (
    new.id,
    coalesce(new.is_anonymous, false),
    -- フルネームの先頭の非空白トークン（半角/全角スペース区切り）。無ければ null。
    substring(
      trim(coalesce(new.raw_user_meta_data->>'name', '')) from '^[^[:space:]　]+'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
