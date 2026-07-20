-- create_trip: 20260702000004 で default_timezone 対応のため関数を丸ごと
-- 書き直した際、trip_pin_options（場所ピンのデフォルトセット）を seed する
-- 呼び出しが抜け落ちていた（意図的な削除ではなく単純な書き漏れ）。
-- 結果、それ以降に作成された旅行は場所ピンの選択肢が空になっていた。
-- seed_default_trip_pin_options 呼び出しを復元する。

create or replace function public.create_trip(
  p_title             text,
  p_start_date        date,
  p_end_date          date,
  p_default_currency  text,
  p_display_name      text,
  p_client_tz         text
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid uuid := auth.uid();
  v_trip_id text;
  v_color int;
  v_attempts int := 0;
begin
  if v_uid is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'display_name required';
  end if;
  if p_default_currency not in ('JPY', 'USD') then
    raise exception 'invalid default_currency';
  end if;

  loop
    begin
      insert into trips (title, start_date, end_date, default_currency, default_timezone)
      values (
        p_title, p_start_date, p_end_date, p_default_currency,
        nullif(trim(p_client_tz), '')
      )
      returning id into v_trip_id;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 5 then
        raise exception 'failed to generate unique trip id after 5 attempts';
      end if;
    end;
  end loop;

  v_color := pick_member_color(v_trip_id);

  insert into trip_members (trip_id, user_id, display_name, kind, color, is_admin)
  values (v_trip_id, v_uid, p_display_name, 'member', v_color, true);

  perform public.seed_default_expense_categories(v_trip_id);
  perform public.seed_default_trip_pin_options(v_trip_id);

  return v_trip_id;
end;
$body$;

revoke all on function public.create_trip(text, date, date, text, text, text) from public;
grant execute on function public.create_trip(text, date, date, text, text, text) to authenticated;
