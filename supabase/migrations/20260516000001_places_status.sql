-- places 機能: status をテーブル化（FK）し、create_place RPC を追加
--
-- 変更:
--  - place_statuses テーブル新設（trip ごと、create_trip 時に seed）
--  - places.status text を撤去し status_id uuid NOT NULL FK に置換
--  - seed_default_place_statuses（候補 / 確定。デフォルトは候補）
--  - create_place RPC（単一行 insert だが status / membership を関数内検証。
--    create_expense と同じ「同 trip の有効値か検証する」方針に揃える）
--  - create_trip に place_statuses の seed を追加
--
-- 開発中のため backfill は書かない。既存 trips を保てないので先頭で
-- truncate trips cascade（trip_members / expenses / places 等も道連れ）。
-- 本番運用に入ったらこのパターンは捨てる。

-- ────────────────────────────────────────────────────────────
-- 既存データ一掃（開発中の運用）
-- ────────────────────────────────────────────────────────────
truncate table trips cascade;

-- ────────────────────────────────────────────────────────────
-- place_statuses（expense_categories と同型。emoji は持たない）
-- ────────────────────────────────────────────────────────────
create table place_statuses (
  id          uuid primary key default gen_random_uuid(),
  trip_id     text not null references trips(id) on delete cascade,
  name        text not null,
  color       text not null,
  sort_order  int  not null,
  created_at  timestamptz not null default now(),
  unique (trip_id, name)
);
create index place_statuses_trip_sort_idx
  on place_statuses (trip_id, sort_order);

alter table place_statuses enable row level security;

create policy place_statuses_select on place_statuses for select
  using (public.is_active_trip_member(trip_id));

create policy place_statuses_insert on place_statuses for insert
  with check (public.is_active_trip_member(trip_id));

create policy place_statuses_update on place_statuses for update
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));

create policy place_statuses_delete on place_statuses for delete
  using (public.is_active_trip_member(trip_id));

-- ────────────────────────────────────────────────────────────
-- デフォルト status の seed 関数（create_trip からも呼ぶ）
-- ────────────────────────────────────────────────────────────
create or replace function public.seed_default_place_statuses(_trip_id text)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into place_statuses (trip_id, name, color, sort_order)
  values
    (_trip_id, '候補', '#f59e0b', 1),
    (_trip_id, '確定', '#10b981', 2);
end;
$body$;

-- ────────────────────────────────────────────────────────────
-- places: status text -> status_id FK
-- （trips を truncate cascade 済みなので places は空）
-- ────────────────────────────────────────────────────────────
alter table places drop column status;

alter table places
  add column status_id uuid not null
    references place_statuses(id) on delete restrict;

create index places_trip_idx   on places (trip_id);
create index places_status_idx on places (status_id);

-- ────────────────────────────────────────────────────────────
-- create_place: 単一行 insert + status / membership 検証
-- ────────────────────────────────────────────────────────────
create or replace function public.create_place(
  p_trip_id         text,
  p_name            text,
  p_status_id       uuid,
  p_visibility      text,
  p_note            text,
  p_google_place_id text,
  p_lat             double precision,
  p_lng             double precision
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid           uuid := auth.uid();
  v_my_member_id  uuid;
  v_place_id      uuid;
  v_status_ok     boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  select exists (
    select 1 from place_statuses
    where id = p_status_id
      and trip_id = p_trip_id
  ) into v_status_ok;

  if not v_status_ok then
    raise exception 'status does not belong to this trip';
  end if;

  insert into places (
    trip_id, created_by_member_id, visibility, google_place_id,
    name, lat, lng, status_id, note
  )
  values (
    p_trip_id, v_my_member_id, p_visibility,
    nullif(trim(coalesce(p_google_place_id, '')), ''),
    trim(p_name), p_lat, p_lng, p_status_id,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_place_id;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_place_id;
end;
$body$;

revoke all on function public.create_place(
  text, text, uuid, text, text, text, double precision, double precision
) from public;
grant execute on function public.create_place(
  text, text, uuid, text, text, text, double precision, double precision
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- create_trip: place_statuses の seed を追加（他は据え置き）
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

  insert into trip_members (trip_id, user_id, display_name, kind)
  values (v_trip_id, v_uid, p_display_name, 'member');

  perform public.seed_default_expense_categories(v_trip_id);
  perform public.seed_default_place_statuses(v_trip_id);

  return v_trip_id;
end;
$body$;

revoke all on function public.create_trip(text, date, date, text, text) from public;
grant execute on function public.create_trip(text, date, date, text, text) to authenticated;
