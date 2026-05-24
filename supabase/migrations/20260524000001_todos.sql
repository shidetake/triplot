-- todos（やりたいことリスト / wishlist）
-- 設計:
--  - trip 単位の共有リスト。active member 全員が読み書きできる（visibility は持たない）。
--    「みんなで埋める旅行のやりたいことリスト」なので private 区分は設けず、
--    誰が書いたかは created_by_member_id で表示する。
--  - priority は固定 3 値（高/中/低）。trip ごとにカスタムしないので CHECK 制約で持つ
--    （expense_categories のようなテーブル化はしない。visibility / default_currency と同列）。
--  - done でチェック状態。並びは優先度順（アプリ側 lib/todoSort で算出。text priority は
--    そのまま order できないため）。
--  - 場所/日程との紐付け・ネストは持たない（要件）。

create table todos (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               text not null references trips(id) on delete cascade,
  created_by_member_id  uuid not null references trip_members(id) on delete cascade,
  title                 text not null,
  priority              text not null
                          check (priority in ('high','medium','low'))
                          default 'medium',
  done                  boolean not null default false,
  created_at            timestamptz not null default now()
);

create index todos_trip_idx on todos (trip_id);

alter table todos enable row level security;

-- 共有リスト：active member なら全操作可（trip_exchange_rates と同型）。
-- 破壊的アクションも誰でも可（このアプリの方針）。
create policy todos_member_all on todos for all
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));

-- create_todo: created_by_member_id を auth.uid() から解決して insert し、
-- last_activity_at も更新する。単一行 insert だが「自分の member 解決＋membership
-- 検証」をサーバ側に閉じるため RPC にする（create_place と同方針）。
create or replace function public.create_todo(
  p_trip_id   text,
  p_title     text,
  p_priority  text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid          uuid := auth.uid();
  v_my_member_id uuid;
  v_todo_id      uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;
  if p_priority not in ('high', 'medium', 'low') then
    raise exception 'invalid priority';
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  insert into todos (trip_id, created_by_member_id, title, priority)
  values (p_trip_id, v_my_member_id, trim(p_title), p_priority)
  returning id into v_todo_id;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_todo_id;
end;
$body$;

revoke all on function public.create_todo(text, text, text) from public;
grant execute on function public.create_todo(text, text, text) to authenticated;
