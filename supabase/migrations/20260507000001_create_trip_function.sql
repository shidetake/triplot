-- create_trip：trip + 自分の trip_member + 為替レートを 1 トランザクションで作る。
-- SECURITY DEFINER で RLS をバイパスし、関数の入口で auth.uid() を確認する。
-- これがないと「INSERT INTO trips RETURNING *」での SELECT ポリシー評価で
-- "row violates row-level security policy" になる（INSERT 直後はまだ
-- trip_members に自分の行がないため）。

create or replace function public.create_trip(
  p_title             text,
  p_start_date        date,
  p_end_date          date,
  p_default_currency  text,
  p_display_name      text,
  p_usd_to_jpy_rate   numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid uuid := auth.uid();
  v_trip_id uuid;
begin
  -- 関数の入口で認可チェック（DEFINER で RLS をバイパスするので自前で書く）
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

  insert into trips (title, start_date, end_date, default_currency)
  values (p_title, p_start_date, p_end_date, p_default_currency)
  returning id into v_trip_id;

  insert into trip_members (trip_id, user_id, display_name, kind)
  values (v_trip_id, v_uid, p_display_name, 'member');

  if p_default_currency = 'JPY'
     and p_usd_to_jpy_rate is not null
     and p_usd_to_jpy_rate > 0 then
    insert into trip_exchange_rates (trip_id, currency, rate_to_default)
    values (v_trip_id, 'USD', p_usd_to_jpy_rate);
  end if;

  return v_trip_id;
end;
$body$;

-- 認証済みユーザのみ呼べるようにする（SECURITY DEFINER のデフォルトは
-- public 全員が EXECUTE 可能なので、anon を弾く）。
revoke all on function public.create_trip(text, date, date, text, text, numeric) from public;
grant execute on function public.create_trip(text, date, date, text, text, numeric) to authenticated;
