-- ────────────────────────────────────────────────────────────
-- trip_pin_options（トリップごとに使える場所ピンの集合）
-- ────────────────────────────────────────────────────────────
-- 旧: PLACE_ICONS が TS のハードコード定数で全 trip 共通だった。
-- 新: trip ごとに「使うピン集合」を持って、ユーザが追加・削除できるようにする。
--
-- icon は lib/placeIcons.ts のカタログのキー（pin / food / hiking / temple_buddhist 等）。
-- label はカタログ既定（lib/placeIcons.ts の getIconLabel）と通常は一致するが、
-- 将来「ラベル編集 UI」を入れた時に差分を許せるよう独立カラムにしておく。
--
-- 既存の expense_categories / place_statuses と同じ trip 子テーブルパターン。

create table trip_pin_options (
  id          uuid primary key default gen_random_uuid(),
  trip_id     text not null references trips(id) on delete cascade,
  icon        text not null,
  label       text not null,
  sort_order  int  not null,
  created_at  timestamptz not null default now(),
  unique (trip_id, icon)
);

create index trip_pin_options_trip_sort_idx
  on trip_pin_options (trip_id, sort_order);

alter table trip_pin_options enable row level security;

-- アクティブメンバーは見れる / 書ける。kind の区別なし。
create policy trip_pin_options_select on trip_pin_options for select
  using (public.is_active_trip_member(trip_id));

create policy trip_pin_options_insert on trip_pin_options for insert
  with check (public.is_active_trip_member(trip_id));

create policy trip_pin_options_update on trip_pin_options for update
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));

create policy trip_pin_options_delete on trip_pin_options for delete
  using (public.is_active_trip_member(trip_id));

-- ────────────────────────────────────────────────────────────
-- デフォルトピン seed（lib/placeIcons.ts の DEFAULT_PIN_KEYS と一致させる）
-- ────────────────────────────────────────────────────────────
create or replace function public.seed_default_trip_pin_options(_trip_id text)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into trip_pin_options (trip_id, icon, label, sort_order)
  values
    (_trip_id, 'pin',                 'その他',     0),
    (_trip_id, 'food',                '食事',       1),
    (_trip_id, 'cafe',                'カフェ',     2),
    (_trip_id, 'bar',                 'バー',       3),
    (_trip_id, 'local_grocery_store', 'スーパー',   4),
    (_trip_id, 'activity',            'レジャー',   5),
    (_trip_id, 'nature',              '自然・公園', 6),
    (_trip_id, 'sightseeing',         '観光・名所', 7),
    (_trip_id, 'lodging',             '宿',         8),
    (_trip_id, 'onsen',               '温泉',       9),
    (_trip_id, 'airport',             '空港',       10),
    (_trip_id, 'station',             '駅',         11);
end;
$body$;

-- ────────────────────────────────────────────────────────────
-- create_trip を更新して、作成時に pin options も seed する
-- （シグネチャ不変）
-- ────────────────────────────────────────────────────────────
create or replace function public.create_trip(
  p_title             text,
  p_start_date        date,
  p_end_date          date,
  p_default_currency  text,
  p_display_name      text
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid uuid := auth.uid();
  v_trip_id text;
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
          public.pick_member_color(v_trip_id));

  perform public.seed_default_expense_categories(v_trip_id);
  perform public.seed_default_place_statuses(v_trip_id);
  perform public.seed_default_trip_pin_options(v_trip_id);

  return v_trip_id;
end;
$body$;
