-- ────────────────────────────────────────────────────────────
-- ユーザーフィードバック（不具合報告・要望）
-- ────────────────────────────────────────────────────────────
-- ユーザーがアプリ内から送る不具合報告/要望。書き込みは /api/feedback（web/RN 共通の
-- 単一経路）から本人のクライアントで insert し、admin が /admin で確認・対応管理する。
-- 設計は docs/design/feedback.md 参照。

create table feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null check (kind in ('bug', 'feature')),
  body       text not null check (char_length(body) between 1 and 2000),
  path       text,           -- どの画面から送ったか（web=pathname / RN=画面名。取れなければ null）
  user_agent text,
  status     text not null check (status in ('open', 'done')) default 'open',
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

-- 本人: 自分の行の insert / select のみ。admin: 全行 select + status 更新。
create policy feedback_insert_own on feedback for insert
  with check (user_id = auth.uid());

create policy feedback_select_own on feedback for select
  using (user_id = auth.uid());

create policy feedback_admin_select on feedback for select
  using (is_app_admin());

create policy feedback_admin_update on feedback for update
  using (is_app_admin())
  with check (is_app_admin());

-- 列レベル権限（users.is_admin の自己昇格対策と同型）:
--  - insert はユーザーが指定してよい列だけ（status/created_at はデフォルト強制）
--  - update は status のみ（admin でも本文・投稿者を改変できない）
--  - delete は誰にも許可しない（保持。件数は小さい）
revoke insert, update, delete on table feedback from anon, authenticated;
grant insert (user_id, kind, body, path, user_agent) on feedback to authenticated;
grant update (status) on feedback to authenticated;

-- admin はユーザープロフィール（表示名・アバター）を読める。/admin でフィードバックの
-- 投稿者を表示するのに必要（users は従来 self-select のみ）。
create policy users_admin_select on users for select
  using (is_app_admin());
