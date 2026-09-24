-- LLM 使用量の記録（日別の抽出通数・単価計算の基準値）を管理者が読めるようにする。
--
-- これまではポリシーが無く service role でしか読めなかったため、管理ページが
-- service role で読んでいた。管理ページは管理者がログインして開くもので、
-- 管理者は運営のためにこのデータを読めるべきなので、「管理者なら読める」を付けて
-- 管理者の権限で読む（docs/database.md「データを誰に読ませるか」）。
-- 書き込みは今まで通り、取り込み処理（service role）だけ。

create policy "ai_usage_daily_admin_select" on "public"."ai_usage_daily"
  for select using ("public"."is_app_admin"());

create policy "ai_usage_baseline_admin_select" on "public"."ai_usage_baseline"
  for select using ("public"."is_app_admin"());

-- レート制限で詰まっている取り込みの件数（全ユーザー分）。
--
-- 管理ページはこれを受信メールの表から直接数えていたが、受信メールは本人しか
-- 読めない（inbound_emails_select_own）ので、管理者自身のメールしか数えて
-- いなかった。受信メールは他のユーザーの私的な中身なので管理者に読ませる
-- ルールは付けず、件数だけを返す。
create or replace function "public"."admin_rate_limited_email_count"()
returns bigint
language "plpgsql" stable security definer
set "search_path" to 'public'
as $$
begin
  if not is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return (
    select count(*)
    from public.inbound_emails
    where status = 'error'
      and extract_error_kind = 'rate_limit'
  );
end;
$$;

alter function "public"."admin_rate_limited_email_count"() owner to "postgres";

revoke all on function "public"."admin_rate_limited_email_count"() from public;
grant all on function "public"."admin_rate_limited_email_count"() to "authenticated";
