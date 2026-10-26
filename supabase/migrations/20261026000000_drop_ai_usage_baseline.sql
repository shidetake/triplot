-- 単価計算の基準値の表 ai_usage_baseline を消す。
--
-- 管理ページの「1通あたり」の単価は、LLM を呼ぶたびに記録する ai_calls から
-- 出すようにした（20261024000000_ai_calls.sql）。累計使用額 ÷ 通数で単価を
-- 出すための基準値は、どこからも読まれなくなった。
--
-- 書いていたのは抽出のたびに走るトリガ（count_extraction）だけ。同じトリガが
-- 日別の通数（ai_usage_daily。グラフで今も使う）も書いているので、トリガは残し、
-- この表を更新する部分だけ外す。関数を先に差し替えてから表を消す（逆にすると、
-- 間に走った抽出がトリガで落ちる）。

create or replace function "public"."count_extraction"() returns "trigger"
    language "plpgsql" security definer
    set "search_path" to 'public'
    as $$
begin
  insert into public.ai_usage_daily (day, extracted_count)
  values ((new.extracted_at at time zone 'utc')::date, 1)
  on conflict (day)
  do update set extracted_count = ai_usage_daily.extracted_count + 1;

  return null;
end;
$$;

drop policy if exists "ai_usage_baseline_admin_select" on "public"."ai_usage_baseline";

drop table if exists "public"."ai_usage_baseline";
