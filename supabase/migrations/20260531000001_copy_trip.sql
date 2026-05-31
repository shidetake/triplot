-- copy_trip：過去の旅行をベースに新しい旅行を作る。
--
-- 仕様（ユーザ合意）:
--  - コピーするのは「場所」と「予定」だけ。費用は一切コピーしない。
--  - 場所: 元 trip の shared な places 全部（候補=tentative も確定も）。private は除外。
--          place の status（候補/確定など）は元 trip の place_statuses をそのまま複製して
--          対応付けるので、ラベル・色・候補フラグまで保たれる。
--  - 予定: shared かつ「全員参加」（event_participants が無い）の events だけ。
--          private や一部メンバー限定（participants 有り）は除外。
--  - 日付は呼び出し側（TS の lib/tripCopy）で新旅行の日程へリマップ済みのものを
--          p_events(jsonb) で受け取る。ここは place 参照の付け替えと atomic 挿入だけ担う。
--
-- create_trip と同じく SECURITY DEFINER で RLS をバイパスし、入口で auth.uid() と
-- 「元 trip のアクティブメンバーか」を自前チェックする。

create or replace function public.copy_trip(
  p_source_trip_id    text,
  p_title             text,
  p_start_date        date,
  p_end_date          date,
  p_default_currency  text,
  p_display_name      text,
  p_events            jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid        uuid := auth.uid();
  v_trip_id    text;
  v_member_id  uuid;
  v_attempts   int := 0;
  v_is_member  boolean;
  v_status_map jsonb := '{}'::jsonb;
  v_place_map  jsonb := '{}'::jsonb;
  v_new_id     uuid;
  r            record;
  ev           jsonb;
  v_place_key  text;
  v_new_place  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
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

  -- 元 trip のアクティブメンバーであることを確認（コピー元を読む権利の根拠）。
  select exists (
    select 1 from trip_members
    where trip_id = p_source_trip_id and user_id = v_uid and left_at is null
  ) into v_is_member;
  if not v_is_member then
    raise exception 'not an active member of the source trip' using errcode = '42501';
  end if;

  -- 新 trip 作成（nanoid 衝突リトライ）。
  loop
    begin
      insert into trips (title, start_date, end_date, default_currency)
      values (p_title, p_start_date, p_end_date, p_default_currency)
      returning id into v_trip_id;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 5 then
        raise exception 'failed to generate unique trip id after 5 attempts';
      end if;
    end;
  end loop;

  insert into trip_members (trip_id, user_id, display_name, kind, color)
  values (v_trip_id, v_uid, p_display_name, 'member',
          public.pick_member_color(v_trip_id))
  returning id into v_member_id;

  -- 費用カテゴリとピンは既定 seed（費用はコピーしないので既定でよい）。
  perform public.seed_default_expense_categories(v_trip_id);
  perform public.seed_default_trip_pin_options(v_trip_id);

  -- place_statuses を元 trip からそのまま複製（候補/確定・色・ラベルを保つ）。
  -- seed_default_place_statuses は呼ばない（複製で置き換える）。
  for r in
    select id, name, color, sort_order, tentative
    from place_statuses
    where trip_id = p_source_trip_id
    order by sort_order
  loop
    insert into place_statuses (trip_id, name, color, sort_order, tentative)
    values (v_trip_id, r.name, r.color, r.sort_order, r.tentative)
    returning id into v_new_id;
    v_status_map := v_status_map || jsonb_build_object(r.id::text, v_new_id::text);
  end loop;

  -- shared な places を全部複製（候補も確定も）。status_id を付け替え。
  for r in
    select id, name, status_id, lat, lng, google_place_id, formatted_address,
           region, locality, note, icon
    from places
    where trip_id = p_source_trip_id and visibility = 'shared'
    order by created_at
  loop
    insert into places (
      trip_id, name, status_id, lat, lng, google_place_id, formatted_address,
      region, locality, visibility, note, icon, created_by_member_id
    )
    values (
      v_trip_id, r.name, (v_status_map->>r.status_id::text)::uuid,
      r.lat, r.lng, r.google_place_id, r.formatted_address,
      r.region, r.locality, 'shared', r.note, r.icon, v_member_id
    )
    returning id into v_new_id;
    v_place_map := v_place_map || jsonb_build_object(r.id::text, v_new_id::text);
  end loop;

  -- 予定を挿入（日付は TS でリマップ済み）。place 参照は元 id → 新 id へ付け替え。
  -- 元 place が複製対象外（private 等）なら place_id は null に落とす。
  for ev in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb))
  loop
    v_place_key := ev->>'place_id';
    if v_place_key is null then
      v_new_place := null;
    else
      v_new_place := nullif(v_place_map->>v_place_key, '')::uuid;
    end if;

    insert into events (
      trip_id, created_by_member_id, visibility, kind, all_day,
      title, start_at, end_at, start_tz, end_tz, place_id, note
    )
    values (
      v_trip_id, v_member_id, 'shared',
      ev->>'kind', coalesce((ev->>'all_day')::boolean, false),
      ev->>'title',
      (ev->>'start_at')::timestamp,
      (ev->>'end_at')::timestamp,
      ev->>'start_tz',
      ev->>'end_tz',
      v_new_place,
      nullif(trim(coalesce(ev->>'note', '')), '')
    );
  end loop;

  return v_trip_id;
end;
$body$;

revoke all on function public.copy_trip(text, text, date, date, text, text, jsonb) from public;
grant execute on function public.copy_trip(text, text, date, date, text, text, jsonb) to authenticated;
