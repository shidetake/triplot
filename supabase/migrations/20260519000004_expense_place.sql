-- expenses に場所を持たせる（要求: 費用にも場所）。Model B なので
-- place_label は作らず place_id 一本（events と同じ）。
--
-- 設計:
--  - expenses.place_id uuid references places(id) on delete set null。
--    費用は作成/削除のみ（更新 UI 無し）なので place は作成時のみ設定。
--  - create_expense に p_place_id を足す（末尾に追加。引数が変わるので
--    旧版を drop して置換。後方互換 shim は作らない）。
--  - 場所欄が Google / 自由入力のときは events と同じく
--    create_expense_with_place / create_expense_with_freetext_place で
--    find_or_create_trip_place / find_or_create_trip_freetext_place に
--    解決してから create_expense に委譲（1 Tx・place_id 一本化）。
--
-- 開発中のため backfill 無し（既存 expenses は place_id NULL でよい）。

-- ────────────────────────────────────────────────────────────
-- expenses.place_id
-- ────────────────────────────────────────────────────────────
alter table expenses
  add column place_id uuid references places(id) on delete set null;

create index expenses_place_idx on expenses (place_id);

-- ────────────────────────────────────────────────────────────
-- 旧 create_expense（11 引数）を drop して p_place_id 付き 12 引数で置換
-- ────────────────────────────────────────────────────────────
drop function if exists public.create_expense(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp, uuid[]
);

create or replace function public.create_expense(
  p_trip_id           text,
  p_local_price       numeric,
  p_local_currency    text,
  p_rate_to_default   numeric,
  p_category_id       uuid,
  p_payer_member_id   uuid,
  p_visibility        text,
  p_splittable        boolean,
  p_note              text,
  p_paid_at           timestamp,
  p_split_member_ids  uuid[],
  p_place_id          uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid              uuid := auth.uid();
  v_my_member_id     uuid;
  v_expense_id       uuid;
  v_split_member_id  uuid;
  v_payer_ok         boolean;
  v_category_ok      boolean;
  v_place_ok         boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_local_price is null or p_local_price <= 0 then
    raise exception 'local_price must be positive';
  end if;
  if p_local_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid local_currency';
  end if;
  if p_rate_to_default is null or p_rate_to_default <= 0 then
    raise exception 'rate_to_default must be positive';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;
  if p_visibility = 'private' and p_splittable then
    raise exception 'private expense cannot be splittable';
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
    select 1 from trip_members
    where id = p_payer_member_id
      and trip_id = p_trip_id
      and left_at is null
  ) into v_payer_ok;

  if not v_payer_ok then
    raise exception 'payer is not an active member of this trip';
  end if;

  select exists (
    select 1 from expense_categories
    where id = p_category_id
      and trip_id = p_trip_id
  ) into v_category_ok;

  if not v_category_ok then
    raise exception 'category does not belong to this trip';
  end if;

  if p_place_id is not null then
    select exists (
      select 1 from places
      where id = p_place_id and trip_id = p_trip_id
    ) into v_place_ok;
    if not v_place_ok then
      raise exception 'place does not belong to this trip';
    end if;
  end if;

  insert into expenses (
    trip_id, created_by_member_id, visibility, local_price, local_currency,
    rate_to_default, category_id, payer_member_id, splittable, note, paid_at,
    place_id
  )
  values (
    p_trip_id, v_my_member_id, p_visibility, p_local_price, p_local_currency,
    p_rate_to_default, p_category_id, p_payer_member_id, p_splittable,
    nullif(trim(coalesce(p_note, '')), ''), coalesce(p_paid_at, (now() at time zone 'utc')),
    p_place_id
  )
  returning id into v_expense_id;

  if p_splittable and p_split_member_ids is not null then
    foreach v_split_member_id in array p_split_member_ids loop
      if not exists (
        select 1 from trip_members
        where id = v_split_member_id
          and trip_id = p_trip_id
          and left_at is null
      ) then
        raise exception 'split member % is not an active member of this trip',
          v_split_member_id;
      end if;
      insert into expense_splits (expense_id, member_id)
      values (v_expense_id, v_split_member_id)
      on conflict do nothing;
    end loop;
  end if;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_expense_id;
end;
$body$;

revoke all on function public.create_expense(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], uuid
) from public;
grant execute on function public.create_expense(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], uuid
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- create_expense_with_place: Google サジェストから選んだ場合。
-- 場所を確定で作成（or 再利用/昇格）→ その place_id で費用作成、を 1 Tx。
-- 費用側の検証は create_expense に委譲する（events と同型）。
-- ────────────────────────────────────────────────────────────
create or replace function public.create_expense_with_place(
  p_trip_id           text,
  p_local_price       numeric,
  p_local_currency    text,
  p_rate_to_default   numeric,
  p_category_id       uuid,
  p_payer_member_id   uuid,
  p_visibility        text,
  p_splittable        boolean,
  p_note              text,
  p_paid_at           timestamp,
  p_split_member_ids  uuid[],
  p_google_place_id   text,
  p_place_name        text,
  p_lat               double precision,
  p_lng               double precision,
  p_formatted_address text,
  p_icon              text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid        uuid := auth.uid();
  v_member_id  uuid;
  v_place_id   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id into v_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  v_place_id := public.find_or_create_trip_place(
    p_trip_id, v_member_id, p_google_place_id, p_place_name,
    p_lat, p_lng, p_formatted_address, p_icon
  );

  return public.create_expense(
    p_trip_id, p_local_price, p_local_currency, p_rate_to_default,
    p_category_id, p_payer_member_id, p_visibility, p_splittable,
    p_note, p_paid_at, p_split_member_ids, v_place_id
  );
end;
$body$;

revoke all on function public.create_expense_with_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text
) from public;
grant execute on function public.create_expense_with_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- create_expense_with_freetext_place: 自由入力から選んだ場合。
-- 未マップ・確定 place を作成（or 再利用）→ その place_id で費用作成。
-- ────────────────────────────────────────────────────────────
create or replace function public.create_expense_with_freetext_place(
  p_trip_id           text,
  p_local_price       numeric,
  p_local_currency    text,
  p_rate_to_default   numeric,
  p_category_id       uuid,
  p_payer_member_id   uuid,
  p_visibility        text,
  p_splittable        boolean,
  p_note              text,
  p_paid_at           timestamp,
  p_split_member_ids  uuid[],
  p_place_name        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid        uuid := auth.uid();
  v_member_id  uuid;
  v_place_id   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id into v_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  v_place_id := public.find_or_create_trip_freetext_place(
    p_trip_id, v_member_id, p_place_name
  );

  return public.create_expense(
    p_trip_id, p_local_price, p_local_currency, p_rate_to_default,
    p_category_id, p_payer_member_id, p_visibility, p_splittable,
    p_note, p_paid_at, p_split_member_ids, v_place_id
  );
end;
$body$;

revoke all on function public.create_expense_with_freetext_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text
) from public;
grant execute on function public.create_expense_with_freetext_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text
) to authenticated;
