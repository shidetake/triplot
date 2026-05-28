-- ────────────────────────────────────────────────────────────
-- メンバー色パレットの再構成 + 確定ステータスを green に
-- ────────────────────────────────────────────────────────────
-- - メンバー色を 8 → 6 に。色相環で重複しないよう red/amber/teal/blue/violet/pink。
--   緑系（green/emerald/teal の green-emerald 側）はメンバーから外して
--   「確定」ステータス用に空ける。teal はメンバー色に残すが、確定は green-600
--   (#16a34a) で「黄緑寄り」に振るので並んでも別キャラとして読める。
-- - 既存 trip の trip_members.color に古い値（emerald/rose/sky/orange 等）が
--   残っていても DB は破壊しない（クライアント側で fallback zinc 表示）。
--   ユーザはメンバー編集 UI で再選択するか、db reset でリセットする。
-- - lib/placeIcons.ts と lib/memberColors.ts の対応 import を一緒に変更済み。

create or replace function public.pick_member_color(p_trip_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $body$
declare
  palette text[] := array[
    'red', 'amber', 'teal', 'blue', 'violet', 'pink'
  ];
  c text;
begin
  foreach c in array palette loop
    if not exists (
      select 1 from trip_members
      where trip_id = p_trip_id
        and color = c
        and left_at is null
    ) then
      return c;
    end if;
  end loop;
  return palette[1];
end;
$body$;

create or replace function public.seed_default_place_statuses(_trip_id text)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into place_statuses (trip_id, name, color, sort_order, tentative)
  values
    (_trip_id, '候補', '#f59e0b', 1, true),
    -- 確定: green-600。メンバーの teal とは色相が違うので別物に読める。
    (_trip_id, '確定', '#16a34a', 2, false);
end;
$body$;
