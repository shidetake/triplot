-- RLS ポリシー
-- 設計方針：
--  - active member（trip_members で left_at が null の人）は trip の shared データに対し読み書き可
--  - private データは投稿者本人のみ読み書き可
--  - kind（member / guest）の区別は MVP では設けない（破壊的アクションも誰でも可）
--  - ヘルパー関数を security definer にして、ポリシーから別テーブルを参照する際の
--    RLS 再帰評価を避ける

-- ────────────────────────────────────────────────────────────
-- ヘルパー関数
-- ────────────────────────────────────────────────────────────

create or replace function public.is_active_trip_member(_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from trip_members
    where trip_id = _trip_id
      and user_id = auth.uid()
      and left_at is null
  );
$$;

create or replace function public.is_own_member(_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from trip_members
    where id = _member_id and user_id = auth.uid()
  );
$$;

-- ────────────────────────────────────────────────────────────
-- RLS 有効化
-- ────────────────────────────────────────────────────────────

alter table users                enable row level security;
alter table trips                enable row level security;
alter table trip_members         enable row level security;
alter table trip_invites         enable row level security;
alter table trip_exchange_rates  enable row level security;
alter table places               enable row level security;
alter table events               enable row level security;
alter table expenses             enable row level security;
alter table expense_splits       enable row level security;

-- ────────────────────────────────────────────────────────────
-- users：自分のレコードのみ
-- ────────────────────────────────────────────────────────────

create policy users_self_select on users for select
  using (id = auth.uid());

create policy users_self_insert on users for insert
  with check (id = auth.uid());

create policy users_self_update on users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- trips：active member のみ全操作可、INSERT は認証済みユーザ
-- ────────────────────────────────────────────────────────────

create policy trips_member_select on trips for select
  using (public.is_active_trip_member(id));

create policy trips_authenticated_insert on trips for insert
  with check (auth.uid() is not null);

create policy trips_member_update on trips for update
  using (public.is_active_trip_member(id))
  with check (public.is_active_trip_member(id));

create policy trips_member_delete on trips for delete
  using (public.is_active_trip_member(id));

-- ────────────────────────────────────────────────────────────
-- trip_members：同じ trip のメンバーは互いを見られる、自分のレコードのみ操作可
-- ────────────────────────────────────────────────────────────

create policy trip_members_visible on trip_members for select
  using (public.is_active_trip_member(trip_id));

create policy trip_members_self_insert on trip_members for insert
  with check (user_id = auth.uid());

create policy trip_members_self_update on trip_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy trip_members_self_delete on trip_members for delete
  using (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- trip_invites / trip_exchange_rates：active member なら全操作可
-- ────────────────────────────────────────────────────────────

create policy trip_invites_member_all on trip_invites for all
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));

create policy trip_exchange_rates_member_all on trip_exchange_rates for all
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));

-- ────────────────────────────────────────────────────────────
-- places / events / expenses：shared は active member、private は本人
-- ────────────────────────────────────────────────────────────

-- places
create policy places_select on places for select
  using (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or
    (visibility = 'private' and public.is_own_member(created_by_member_id))
  );

create policy places_insert on places for insert
  with check (
    public.is_active_trip_member(trip_id)
    and public.is_own_member(created_by_member_id)
  );

create policy places_update on places for update
  using (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or
    (visibility = 'private' and public.is_own_member(created_by_member_id))
  )
  with check (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or
    (visibility = 'private' and public.is_own_member(created_by_member_id))
  );

create policy places_delete on places for delete
  using (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or
    (visibility = 'private' and public.is_own_member(created_by_member_id))
  );

-- events
create policy events_select on events for select
  using (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or
    (visibility = 'private' and public.is_own_member(created_by_member_id))
  );

create policy events_insert on events for insert
  with check (
    public.is_active_trip_member(trip_id)
    and public.is_own_member(created_by_member_id)
  );

create policy events_update on events for update
  using (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or
    (visibility = 'private' and public.is_own_member(created_by_member_id))
  )
  with check (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or
    (visibility = 'private' and public.is_own_member(created_by_member_id))
  );

create policy events_delete on events for delete
  using (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or
    (visibility = 'private' and public.is_own_member(created_by_member_id))
  );

-- expenses
create policy expenses_select on expenses for select
  using (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or
    (visibility = 'private' and public.is_own_member(created_by_member_id))
  );

create policy expenses_insert on expenses for insert
  with check (
    public.is_active_trip_member(trip_id)
    and public.is_own_member(created_by_member_id)
  );

create policy expenses_update on expenses for update
  using (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or
    (visibility = 'private' and public.is_own_member(created_by_member_id))
  )
  with check (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or
    (visibility = 'private' and public.is_own_member(created_by_member_id))
  );

create policy expenses_delete on expenses for delete
  using (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or
    (visibility = 'private' and public.is_own_member(created_by_member_id))
  );

-- ────────────────────────────────────────────────────────────
-- expense_splits：親 expense にアクセスできれば操作可
-- ────────────────────────────────────────────────────────────

create policy expense_splits_all on expense_splits for all
  using (
    exists (
      select 1 from expenses e
      where e.id = expense_id
        and (
          (e.visibility = 'shared' and public.is_active_trip_member(e.trip_id))
          or
          (e.visibility = 'private' and public.is_own_member(e.created_by_member_id))
        )
    )
  )
  with check (
    exists (
      select 1 from expenses e
      where e.id = expense_id
        and (
          (e.visibility = 'shared' and public.is_active_trip_member(e.trip_id))
          or
          (e.visibility = 'private' and public.is_own_member(e.created_by_member_id))
        )
    )
  );
