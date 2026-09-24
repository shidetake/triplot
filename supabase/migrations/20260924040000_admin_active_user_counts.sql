-- 管理ページの「アクティブユーザー数」。専用のトラッキングは持たず、
-- Supabase Auth が既に持っている auth.users.last_sign_in_at を読むだけ。
--
-- 期間は**半年（180日）の1本**に決め打つ。旅行計画アプリは日常アプリと違い
-- 使う間隔が空くのが普通なので、直近7日・30日のような細かい刻みは実態に
-- 合わない（旅行の計画期間・頻度を考えると半年〜1年が妥当。まずは半年）。
-- 複数期間を並べて選ばせるほどの使い方をしないので、1本に決め打って単純にする。
--
-- 「サインインした」であって「今この瞬間に開いている」ではない点に注意:
-- JWT のリフレッシュでは更新されず、明示的なサインイン（ログイン・匿名サイン
-- インでの新規参加）でのみ動く。継続利用の目安として使う。
--
-- 集計は public.users.is_anonymous を軸にする（ゲストの扱いは登録ユーザー数の
-- 表示と同じ定義に揃える）。ゲスト→本登録の昇格は public.users.is_anonymous を
-- 直接 false に落とすだけで auth.users 側は追随しない（guest_upgrade_tickets の
-- redeem_guest_upgrade_ticket 参照）ため、public.users を単一の真実にする。
-- 旧版（直近7日/30日の2本立て）は使わない方針にしたので落とす。
drop function if exists "public"."admin_active_user_counts"();

create or replace function "public"."admin_active_user_count"()
returns bigint
language "plpgsql" security definer
set "search_path" to 'public'
as $$
declare
  v_count bigint;
begin
  if not is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*) into v_count
  from auth.users au
  join public.users pu on pu.id = au.id
  where pu.is_anonymous = false
    and au.last_sign_in_at >= now() - interval '180 days';

  return v_count;
end;
$$;

alter function "public"."admin_active_user_count"() owner to "postgres";

revoke all on function "public"."admin_active_user_count"() from public;
grant all on function "public"."admin_active_user_count"() to "authenticated";
