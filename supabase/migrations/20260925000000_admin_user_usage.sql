-- 管理ページの「ユーザー一覧」。登録ユーザーごとの利用の量を返す。
--
-- 目的は使われ方の分析。返すのは件数と日付だけで、旅行の名前・予定・メールの
-- 中身など他人の私的な中身は返さない（docs/database.md「データを誰に読ませるか」）。
-- 受信メールや旅行の表を管理者に直接読ませるルールは付けず、この関数が数えた
-- 結果だけを渡す。名前は表示名のみ（プライバシーポリシーの利用目的
-- 「サービスの運営・改善のための利用状況の把握」）。
--
-- 各列の定義:
-- - last_active_at: 最後に使った時刻。サインインとセッションの自動更新の新しい方
--   （アクティブユーザー数と同じ考え方。compute_active_user_count 参照）。
-- - trip_count: 参加中（退会していない）の旅行の数。
-- - imports_this_month: 今月（UTC）の取り込みで読み取りをした件数。利用者の
--   受信箱に出している「今月の取り込み」と同じ数え方（extracted_at）。
-- - imports_90d: 直近90日の同じ件数。累計は出さない —— 確定も破棄もされない
--   まま90日たったメールは自動で消えるので、残っている行からは正確な累計が
--   出せない。90日以内なら消える前なので正確。
-- - failed_count: 今、取り込みに失敗したままのメールの件数。
-- - cap_override: 月の上限の個別上書き（実効上限はアプリ側の effectiveEmailCap で
--   共通の上限と合わせて決める）。
create or replace function "public"."admin_user_usage"()
returns table (
  "user_id" uuid,
  "display_name" text,
  "registered_at" timestamptz,
  "last_active_at" timestamptz,
  "trip_count" bigint,
  "imports_this_month" bigint,
  "imports_90d" bigint,
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
      where ie.user_id = pu.id
        and ie.extracted_at >= now() - interval '90 days'),
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
