-- triplot 初期スキーマ
-- 設計の前提：
--  - 旅行（trips）は所有者を持たない共同物。trip_members で多対多に参加者を紐付ける
--  - 投稿系（places / events / expenses）は visibility で shared/private を分ける
--  - 多通貨対応：trip_exchange_rates に手動レートを持ち、default_currency に換算する
--  - trips.id は URL に出すため短い ID（10文字 base62）。他テーブルの主キーは uuid

-- ────────────────────────────────────────────────────────────
-- nanoid 関数（URL 用の短い ID 生成）
-- ────────────────────────────────────────────────────────────
create or replace function public.nanoid(size int default 10)
returns text
language plpgsql
volatile
as $body$
declare
  alphabet text := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  result text := '';
  i int;
begin
  for i in 1..size loop
    result := result || substr(alphabet, 1 + floor(random() * 62)::int, 1);
  end loop;
  return result;
end;
$body$;

-- ────────────────────────────────────────────────────────────
-- users（Supabase Auth と1対1）
-- ────────────────────────────────────────────────────────────
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  google_uid    text unique,
  display_name  text,
  is_anonymous  boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- trips（旅行）
-- id は URL に出るため短い ID。10文字 base62 で衝突 50% に達するのは 9 億件規模。
-- ────────────────────────────────────────────────────────────
create table trips (
  id                text primary key default public.nanoid(10),
  title             text not null,
  start_date        date,
  end_date          date,
  status            text not null
                      check (status in ('planning','ongoing','finished'))
                      default 'planning',
  default_currency  text not null
                      check (default_currency in ('JPY','USD'))
                      default 'JPY',
  last_activity_at  timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- trip_members（trips × users の多対多）
-- ────────────────────────────────────────────────────────────
create table trip_members (
  id            uuid primary key default gen_random_uuid(),
  trip_id       text not null references trips(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  display_name  text not null,
  color         text,
  kind          text not null check (kind in ('member','guest')),
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  unique (trip_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- trip_invites（リンク参加用トークン、ハッシュ保存）
-- ────────────────────────────────────────────────────────────
create table trip_invites (
  trip_id     text not null references trips(id) on delete cascade,
  token_hash  text primary key
);

-- ────────────────────────────────────────────────────────────
-- trip_exchange_rates（trip 内の手動為替レート）
-- ────────────────────────────────────────────────────────────
create table trip_exchange_rates (
  trip_id          text not null references trips(id) on delete cascade,
  currency         text not null check (currency in ('JPY','USD')),
  rate_to_default  numeric not null,
  primary key (trip_id, currency)
);

-- ────────────────────────────────────────────────────────────
-- places（マップピン）
-- ────────────────────────────────────────────────────────────
create table places (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               text not null references trips(id) on delete cascade,
  created_by_member_id  uuid not null references trip_members(id) on delete cascade,
  visibility            text not null check (visibility in ('shared','private')),
  google_place_id       text,
  name                  text not null,
  lat                   double precision,
  lng                   double precision,
  status                text,
  note                  text,
  created_at            timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- events（スケジュールイベント）
-- ────────────────────────────────────────────────────────────
create table events (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               text not null references trips(id) on delete cascade,
  created_by_member_id  uuid not null references trip_members(id) on delete cascade,
  visibility            text not null check (visibility in ('shared','private')),
  title                 text not null,
  start_at              timestamptz not null,
  end_at                timestamptz,
  place_id              uuid references places(id) on delete set null,
  note                  text,
  created_at            timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- expenses（費用、多通貨）
-- ────────────────────────────────────────────────────────────
create table expenses (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               text not null references trips(id) on delete cascade,
  created_by_member_id  uuid not null references trip_members(id) on delete cascade,
  visibility            text not null check (visibility in ('shared','private')),
  amount                numeric not null,
  currency              text not null check (currency in ('JPY','USD')),
  payer_member_id       uuid not null references trip_members(id) on delete cascade,
  splittable            boolean not null default true,
  note                  text,
  paid_at               timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  -- private は割り勘不可
  check (visibility = 'shared' or splittable = false)
);

-- ────────────────────────────────────────────────────────────
-- expense_splits（割り勘対象、多対多）
-- ────────────────────────────────────────────────────────────
create table expense_splits (
  expense_id  uuid not null references expenses(id) on delete cascade,
  member_id   uuid not null references trip_members(id) on delete cascade,
  primary key (expense_id, member_id)
);

-- ────────────────────────────────────────────────────────────
-- インデックス
-- ────────────────────────────────────────────────────────────
create index trip_members_user_active_idx  on trip_members (user_id, left_at);
create index trip_members_trip_idx         on trip_members (trip_id);
create index places_trip_visibility_idx    on places (trip_id, visibility);
create index events_trip_start_idx         on events (trip_id, visibility, start_at);
create index expenses_trip_visibility_idx  on expenses (trip_id, visibility);
create index expense_splits_member_idx     on expense_splits (member_id);
