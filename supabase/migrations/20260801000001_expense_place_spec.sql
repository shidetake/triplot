-- 費用の場所指定を、予定と同じ jsonb の place spec に統一する。
--
-- 予定は 20260731000001 で「場所の渡し方を値で表す」方式に移り、RPC が1本に
-- 畳まれた。費用だけが旧方式（渡し方ごとに RPC を分ける）のまま残っており、
-- 同じことを2つの流儀で書いている状態だった。
--
-- 変種方式のコストは実際に効いている: expenses の RPC は現在6本
-- （create/update × 素/Google/自由入力）あり、**列を1つ足すたびに6箇所の
-- ほぼ同一の本体を直す**必要があった（p_tz の撤去では実際にそうなった）。
-- 場所が1つなので変種は爆発しないが、二重管理そのものが負債なので寄せる。
--
-- ここで消すラッパー4本は本体を呼ぶだけの薄い層なので、振る舞いは変わらない
-- （場所の解決が resolve_place_spec に移るだけ）。

-- ────────────────────────────────────────────────────────────
-- ラッパー4本を落とす。呼び出し側（packages/shared/src/data/expenses.ts）は
-- 同じコミットで create_expense / update_expense の1本に切り替える。
-- ────────────────────────────────────────────────────────────
drop function if exists public.create_expense_with_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, uuid, text
);
drop function if exists public.create_expense_with_freetext_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, uuid, text
);
drop function if exists public.update_expense_with_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, uuid, text
);
drop function if exists public.update_expense_with_freetext_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, uuid, text
);

-- ════════════════════════════════════════════════════════════
-- create_expense: p_place_id uuid → p_place jsonb
-- ════════════════════════════════════════════════════════════

drop function if exists public.create_expense(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], uuid, uuid, text
);

create or replace function public.create_expense(
  p_trip_id                 text,
  p_local_price             numeric,
  p_local_currency          text,
  p_rate_to_default         numeric,
  p_category_id             uuid,
  p_payer_member_id         uuid,
  p_visibility              text,
  p_splittable              boolean,
  p_note                    text,
  p_paid_at                 timestamp,
  p_split_member_ids        uuid[],
  p_place                   jsonb,
  p_tz_disambig_transit_id  uuid,
  p_tz_disambig_side        text
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
  v_place_id         uuid;
  v_paid_at          timestamp := coalesce(p_paid_at, (now() at time zone 'utc'));
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

  perform public.validate_tz_disambig(p_trip_id, p_tz_disambig_transit_id, p_tz_disambig_side);

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

  -- 既存 id の trip 所属チェックも resolve_place_spec の中で行う。
  v_place_id := public.resolve_place_spec(p_trip_id, v_my_member_id, p_place);

  insert into expenses (
    trip_id, created_by_member_id, visibility, local_price, local_currency,
    rate_to_default, category_id, payer_member_id, splittable, note, paid_at,
    place_id, tz_disambig_transit_id, tz_disambig_side
  )
  values (
    p_trip_id, v_my_member_id, p_visibility, p_local_price, p_local_currency,
    p_rate_to_default, p_category_id, p_payer_member_id, p_splittable,
    nullif(trim(coalesce(p_note, '')), ''), v_paid_at,
    v_place_id, p_tz_disambig_transit_id, p_tz_disambig_side
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
  uuid[], jsonb, uuid, text
) from public;
grant execute on function public.create_expense(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], jsonb, uuid, text
) to authenticated;

-- ════════════════════════════════════════════════════════════
-- update_expense: p_place_id uuid → p_place jsonb
-- ════════════════════════════════════════════════════════════

drop function if exists public.update_expense(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], uuid, uuid, text
);

create or replace function public.update_expense(
  p_expense_id              uuid,
  p_local_price             numeric,
  p_local_currency          text,
  p_rate_to_default         numeric,
  p_category_id             uuid,
  p_payer_member_id         uuid,
  p_visibility              text,
  p_splittable              boolean,
  p_note                    text,
  p_paid_at                 timestamp,
  p_split_member_ids        uuid[],
  p_place                   jsonb,
  p_tz_disambig_transit_id  uuid,
  p_tz_disambig_side        text
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
  v_my_member_id     uuid;
  v_is_creator       boolean;
  v_payer_ok         boolean;
  v_category_ok      boolean;
  v_place_id         uuid;
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

  perform public.validate_tz_disambig(v_trip_id, p_tz_disambig_transit_id, p_tz_disambig_side);

  -- メンバー判定と「場所を作るときの作成者」を兼ねるので id で取る。
  select id into v_my_member_id
  from trip_members
  where trip_id = v_trip_id and user_id = v_uid and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  select exists (
    select 1 from trip_members
    where id = v_creator and user_id = v_uid
  ) into v_is_creator;

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

  v_place_id := public.resolve_place_spec(v_trip_id, v_my_member_id, p_place);

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
      tz_disambig_transit_id = p_tz_disambig_transit_id,
      tz_disambig_side       = p_tz_disambig_side,
      place_id        = v_place_id
  where id = p_expense_id;

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
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], jsonb, uuid, text
) from public;
grant execute on function public.update_expense(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], jsonb, uuid, text
) to authenticated;
