-- ────────────────────────────────────────────────────────────
-- カスタムアバター
-- ────────────────────────────────────────────────────────────
-- 任意のカスタムアバター画像。設定すると Google の写真より優先して表示する。
-- 画像は Storage の avatars バケット（公開読み取り）に置き、その公開 URL を保存する。

alter table users add column avatar_url text;

-- アバター画像の保管バケット（公開：読み取りは誰でも可。書き込みは本人フォルダのみ）。
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 読み取りは誰でも（公開アバター）。
create policy "avatars_read_all" on storage.objects
  for select using (bucket_id = 'avatars');

-- 書き込み（追加・更新・削除）は、パス先頭フォルダが自分の uid のときだけ。
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
