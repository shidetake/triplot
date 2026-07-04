-- ────────────────────────────────────────────────────────────
-- サイト管理者（app admin）
-- ────────────────────────────────────────────────────────────
-- 運用者向けの管理ページ（/admin。初出はリンク enrichment の候補ホスト昇格ビュー）の
-- アクセス制御。trip_members.is_admin（旅行内の権限）とは別の、サイト全体の権限。
-- 付与 UI は作らない — 手動 SQL で運用する:
--   update users set is_admin = true where id = '<user uuid>';

alter table users add column is_admin boolean not null default false;

-- 自己昇格の防止。既存の users_self_update / users_self_insert は行レベル（自分の行か）
-- しか縛れず、このままだと自分の is_admin を true にできてしまう。authenticated の
-- テーブル権限を落とし、update はアプリが実際に書く列だけ列レベルで許可する。
-- insert は不要（users 行は auth トリガー handle_new_user＝SECURITY DEFINER が作る）。
revoke insert, update on table users from anon, authenticated;
grant update (display_name, avatar_url) on users to authenticated;

-- 呼び出しユーザがサイト管理者か。SECURITY DEFINER なのは他テーブルのポリシーから
-- users を参照する際に users 自身の RLS を再帰評価させないため（is_active_trip_member と同型）。
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from users where id = auth.uid()),
    false
  );
$$;

-- 候補ホスト表は管理者だけが読める（書き込みは従来どおり service role の
-- record_receipt_link_candidate のみ）。
create policy receipt_link_candidates_admin_select on receipt_link_candidates for select
  using (is_app_admin());
