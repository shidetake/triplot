-- ────────────────────────────────────────────────────────────
-- TODO のいいね（現地TODO 専用の軽い反応）
-- ────────────────────────────────────────────────────────────
-- (todo_id, member_id) で 1 人 1 いいね。再度押せばキャンセル（行を delete）。
-- UI 側で「現地TODO だけにボタン出す」運用なので、DB 側で kind を制約しない
-- （アプリ層でガード）。
--
-- RLS: 親 todo が見える人（= active trip member）は like も見れる。
-- insert/delete は member_id が自分の trip_member であることを確認。

create table todo_likes (
  todo_id    uuid not null references todos(id) on delete cascade,
  member_id  uuid not null references trip_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (todo_id, member_id)
);

create index todo_likes_todo_idx on todo_likes (todo_id);

alter table todo_likes enable row level security;

create policy todo_likes_select on todo_likes for select
  using (
    exists (
      select 1 from todos t
      where t.id = todo_likes.todo_id
        and public.is_active_trip_member(t.trip_id)
    )
  );

create policy todo_likes_insert on todo_likes for insert
  with check (
    exists (
      select 1 from todos t
      where t.id = todo_id
        and public.is_active_trip_member(t.trip_id)
    )
    and exists (
      select 1 from trip_members m
      where m.id = member_id and m.user_id = auth.uid() and m.left_at is null
    )
  );

create policy todo_likes_delete on todo_likes for delete
  using (
    exists (
      select 1 from trip_members m
      where m.id = member_id and m.user_id = auth.uid()
    )
  );
