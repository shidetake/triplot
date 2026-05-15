-- B 拡張: カテゴリと per-expense 為替レート
--
-- 変更:
--  - expense_categories テーブル新設（trip ごと、create_trip 時に 11 個 seed）
--  - expenses から amount / currency を撤去し、local_price / local_currency /
--    rate_to_default / category_id に置換
--  - trip_exchange_rates テーブルは廃止（per-expense レートに統一）
--  - create_trip から p_usd_to_jpy_rate を撤去、デフォルトカテゴリ seed を追加
--  - create_expense を新スキーマに対応
--
-- 開発中のため: 既存 trips を保つ backfill は書かず、先頭で truncate trips cascade
-- する（trip_members / expenses / expense_categories も道連れ）。本番運用に入ったら
-- このパターンは捨てる。

-- ────────────────────────────────────────────────────────────
-- 既存データ一掃（開発中の運用）
-- 既存 trips があると下流の NOT NULL 追加・FK 追加が崩れる。backfill は書かない。
-- ────────────────────────────────────────────────────────────
truncate table trips cascade;

-- ────────────────────────────────────────────────────────────
-- expense_categories
-- ────────────────────────────────────────────────────────────
create table expense_categories (
  id          uuid primary key default gen_random_uuid(),
  trip_id     text not null references trips(id) on delete cascade,
  name        text not null,
  color       text not null,
  emoji       text not null,
  sort_order  int  not null,
  created_at  timestamptz not null default now(),
  unique (trip_id, name)
);
create index expense_categories_trip_sort_idx
  on expense_categories (trip_id, sort_order);

alter table expense_categories enable row level security;

create policy expense_categories_select on expense_categories for select
  using (public.is_active_trip_member(trip_id));

create policy expense_categories_insert on expense_categories for insert
  with check (public.is_active_trip_member(trip_id));

create policy expense_categories_update on expense_categories for update
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));

create policy expense_categories_delete on expense_categories for delete
  using (public.is_active_trip_member(trip_id));

-- ────────────────────────────────────────────────────────────
-- デフォルトカテゴリの seed 関数（create_trip からも呼ぶ）
-- ────────────────────────────────────────────────────────────
create or replace function public.seed_default_expense_categories(_trip_id text)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into expense_categories (trip_id, name, color, emoji, sort_order)
  values
    (_trip_id, '渡航',     '#3b82f6', '✈️', 1),
    (_trip_id, '現地移動', '#06b6d4', '🚊', 2),
    (_trip_id, '飲食',     '#f97316', '🍽️', 3),
    (_trip_id, '衣服',     '#a855f7', '👕', 4),
    (_trip_id, 'エンタメ', '#ec4899', '🎉', 5),
    (_trip_id, '土産',     '#ef4444', '🎁', 6),
    (_trip_id, '宿泊',     '#6366f1', '🏨', 7),
    (_trip_id, '通信',     '#6b7280', '📡', 8),
    (_trip_id, '医療',     '#10b981', '🏥', 9),
    (_trip_id, 'カジノ',   '#f59e0b', '🎰', 10),
    (_trip_id, 'その他',   '#71717a', '❓', 11);
end;
$body$;

-- ────────────────────────────────────────────────────────────
-- expenses スキーマ変更
-- （trips を truncate cascade 済みなので expenses は空）
-- ────────────────────────────────────────────────────────────
alter table expenses drop column amount;
alter table expenses drop column currency;

alter table expenses
  add column local_price     numeric not null check (local_price > 0),
  add column local_currency  text    not null check (local_currency in ('JPY','USD')),
  add column rate_to_default numeric not null check (rate_to_default > 0),
  add column category_id     uuid    not null
    references expense_categories(id) on delete restrict;

create index expenses_category_idx on expenses (category_id);

-- ────────────────────────────────────────────────────────────
-- trip_exchange_rates 廃止
-- ────────────────────────────────────────────────────────────
drop table trip_exchange_rates;

-- ────────────────────────────────────────────────────────────
-- create_trip: rate 引数撤去、デフォルトカテゴリ seed
-- ────────────────────────────────────────────────────────────
drop function if exists public.create_trip(text, date, date, text, text, numeric);

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

  return v_trip_id;
end;
$body$;

revoke all on function public.create_trip(text, date, date, text, text) from public;
grant execute on function public.create_trip(text, date, date, text, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- create_expense: 新スキーマ対応
-- ────────────────────────────────────────────────────────────
drop function if exists public.create_expense(
  text, numeric, text, uuid, text, boolean, text, timestamptz, uuid[]
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
  p_paid_at           timestamptz,
  p_split_member_ids  uuid[]
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

  insert into expenses (
    trip_id, created_by_member_id, visibility, local_price, local_currency,
    rate_to_default, category_id, payer_member_id, splittable, note, paid_at
  )
  values (
    p_trip_id, v_my_member_id, p_visibility, p_local_price, p_local_currency,
    p_rate_to_default, p_category_id, p_payer_member_id, p_splittable,
    nullif(trim(coalesce(p_note, '')), ''), coalesce(p_paid_at, now())
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
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamptz, uuid[]
) from public;
grant execute on function public.create_expense(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamptz, uuid[]
) to authenticated;
