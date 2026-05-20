-- update_expense + 場所付き wrappers。
-- create_expense / events の update_event* と同型の 3 関数構成にする:
--   - update_expense              … 保存済み or 場所なしを直接 p_place_id で
--   - update_expense_with_place   … Google 由来 → find_or_create_trip_place
--   - update_expense_with_freetext_place … 自由入力 → find_or_create_trip_freetext_place
--
-- 権限:
--   - 呼び出し者は trip のアクティブメンバー
--   - private は作成者のみ編集可。shared→private 化も作成者のみ
--   - private は splittable=false（CHECK 制約と同条件で関数も拒否）
--
-- splits は毎回張り替え（delete → insert）で素直に整合させる。

create or replace function public.update_expense(
  p_expense_id        uuid,
  p_local_price       numeric,
  p_local_currency    text,
  p_rate_to_default   numeric,
  p_category_id       uuid,
  p_payer_member_id   uuid,
  p_visibility        text,
  p_splittable        boolean,
  p_note              text,
  p_paid_at           timestamptz,
  p_split_member_ids  uuid[],
  p_place_id          uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid              uuid := auth.uid();
  v_trip_id          text;
  v_creator          uuid;
  v_old_vis          text;
  v_is_member        boolean;
  v_is_creator       boolean;
  v_payer_ok         boolean;
  v_category_ok      boolean;
  v_place_ok         boolean;
  v_split_member_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_local_price is null or p_local_price <= 0 then
    raise exception 'local_price must be positive';
  end if;
  if p_local_currency not in ('JPY', 'USD') then
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

  select trip_id, created_by_member_id, visibility
    into v_trip_id, v_creator, v_old_vis
  from expenses
  where id = p_expense_id;

  if v_trip_id is null then
    raise exception 'expense not found';
  end if;

  select exists (
    select 1 from trip_members
    where trip_id = v_trip_id and user_id = v_uid and left_at is null
  ) into v_is_member;
  if not v_is_member then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  select exists (
    select 1 from trip_members
    where id = v_creator and user_id = v_uid
  ) into v_is_creator;

  -- private は作成者のみ。shared→private 化も作成者のみ。
  if (v_old_vis = 'private' or p_visibility = 'private') and not v_is_creator then
    raise exception 'not allowed to edit this expense' using errcode = '42501';
  end if;

  select exists (
    select 1 from trip_members
    where id = p_payer_member_id
      and trip_id = v_trip_id
      and left_at is null
  ) into v_payer_ok;
  if not v_payer_ok then
    raise exception 'payer is not an active member of this trip';
  end if;

  select exists (
    select 1 from expense_categories
    where id = p_category_id
      and trip_id = v_trip_id
  ) into v_category_ok;
  if not v_category_ok then
    raise exception 'category does not belong to this trip';
  end if;

  if p_place_id is not null then
    select exists (
      select 1 from places
      where id = p_place_id and trip_id = v_trip_id
    ) into v_place_ok;
    if not v_place_ok then
      raise exception 'place does not belong to this trip';
    end if;
  end if;

  update expenses
  set local_price     = p_local_price,
      local_currency  = p_local_currency,
      rate_to_default = p_rate_to_default,
      category_id     = p_category_id,
      payer_member_id = p_payer_member_id,
      visibility      = p_visibility,
      splittable      = p_splittable,
      note            = nullif(trim(coalesce(p_note, '')), ''),
      paid_at         = coalesce(p_paid_at, paid_at),
      place_id        = p_place_id
  where id = p_expense_id;

  -- splits は張り替え。splittable=false なら空のまま残す。
  delete from expense_splits where expense_id = p_expense_id;
  if p_splittable and p_split_member_ids is not null then
    foreach v_split_member_id in array p_split_member_ids loop
      if not exists (
        select 1 from trip_members
        where id = v_split_member_id
          and trip_id = v_trip_id
          and left_at is null
      ) then
        raise exception 'split member % is not an active member of this trip',
          v_split_member_id;
      end if;
      insert into expense_splits (expense_id, member_id)
      values (p_expense_id, v_split_member_id)
      on conflict do nothing;
    end loop;
  end if;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$body$;

revoke all on function public.update_expense(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamptz,
  uuid[], uuid
) from public;
grant execute on function public.update_expense(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamptz,
  uuid[], uuid
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- update_expense_with_place: Google サジェスト由来の場所付き
-- ────────────────────────────────────────────────────────────
create or replace function public.update_expense_with_place(
  p_expense_id        uuid,
  p_local_price       numeric,
  p_local_currency    text,
  p_rate_to_default   numeric,
  p_category_id       uuid,
  p_payer_member_id   uuid,
  p_visibility        text,
  p_splittable        boolean,
  p_note              text,
  p_paid_at           timestamptz,
  p_split_member_ids  uuid[],
  p_google_place_id   text,
  p_place_name        text,
  p_lat               double precision,
  p_lng               double precision,
  p_formatted_address text,
  p_icon              text
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid        uuid := auth.uid();
  v_trip_id    text;
  v_member_id  uuid;
  v_place_id   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id into v_trip_id
  from expenses
  where id = p_expense_id;

  if v_trip_id is null then
    raise exception 'expense not found';
  end if;

  select id into v_member_id
  from trip_members
  where trip_id = v_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  v_place_id := public.find_or_create_trip_place(
    v_trip_id, v_member_id, p_google_place_id, p_place_name,
    p_lat, p_lng, p_formatted_address, p_icon
  );

  perform public.update_expense(
    p_expense_id, p_local_price, p_local_currency, p_rate_to_default,
    p_category_id, p_payer_member_id, p_visibility, p_splittable,
    p_note, p_paid_at, p_split_member_ids, v_place_id
  );
end;
$body$;

revoke all on function public.update_expense_with_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamptz,
  uuid[], text, text, double precision, double precision, text, text
) from public;
grant execute on function public.update_expense_with_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamptz,
  uuid[], text, text, double precision, double precision, text, text
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- update_expense_with_freetext_place: 自由入力の場所付き
-- ────────────────────────────────────────────────────────────
create or replace function public.update_expense_with_freetext_place(
  p_expense_id        uuid,
  p_local_price       numeric,
  p_local_currency    text,
  p_rate_to_default   numeric,
  p_category_id       uuid,
  p_payer_member_id   uuid,
  p_visibility        text,
  p_splittable        boolean,
  p_note              text,
  p_paid_at           timestamptz,
  p_split_member_ids  uuid[],
  p_place_name        text
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid        uuid := auth.uid();
  v_trip_id    text;
  v_member_id  uuid;
  v_place_id   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id into v_trip_id
  from expenses
  where id = p_expense_id;

  if v_trip_id is null then
    raise exception 'expense not found';
  end if;

  select id into v_member_id
  from trip_members
  where trip_id = v_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  v_place_id := public.find_or_create_trip_freetext_place(
    v_trip_id, v_member_id, p_place_name
  );

  perform public.update_expense(
    p_expense_id, p_local_price, p_local_currency, p_rate_to_default,
    p_category_id, p_payer_member_id, p_visibility, p_splittable,
    p_note, p_paid_at, p_split_member_ids, v_place_id
  );
end;
$body$;

revoke all on function public.update_expense_with_freetext_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamptz,
  uuid[], text
) from public;
grant execute on function public.update_expense_with_freetext_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamptz,
  uuid[], text
) to authenticated;
