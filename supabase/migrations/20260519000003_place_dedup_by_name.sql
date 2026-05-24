-- 場所の同名デデュープを対称化する。
--
-- 背景:
--  - find_or_create_trip_place（Google）は gpid 一致でのみ再利用、
--    find_or_create_trip_freetext_place（自由入力）は未マップ同名でのみ
--    再利用していた。両者のキー（gpid / 未マップ同名）が交わらないため、
--    「自由入力で作った同名 place」と「後で Google から選んだ同名 place」が
--    別行になり重複しうる（逆順も同様）。
--  - 「同名＝同一場所」を仕様として徹底するため、両関数を互いに意識させる:
--      * Google: gpid 一致が無ければ、同名・未マップ・shared の既存を
--        「昇格」（名前を Google 表記に揃え、gpid/lat/lng/住所を埋める）
--        して再利用。重複を作らない。どちらの操作順でも最終状態が一致する
--        （= 常に Google の正規表記＋座標）。status/visibility/note/icon は
--        ユーザ設定を尊重し触らない。
--      * 自由入力: 同名・shared の既存があれば（Google 由来でも）再利用。
--        マップ済みを優先。無ければ未マップ・確定で新規（予定/費用に入れた
--        時点で訪問可否は確定済み。未確定なのは座標だけ。Google 経路と
--        揃え、操作順に依らず status も一致させる）。
--  - 名前一致マージなので「同名の別店」を同一視しうるが、これは既に
--    自由入力↔自由入力の find-or-create で受け入れ済みの性質（同名再利用を
--    選択した時点の前提）。昇格は座標ゼロの place を埋め、名前を Google
--    表記へ正規化するだけ（同名一致が前提なので表記ゆれの吸収のみ）。
--
-- シグネチャは不変（create or replace。型再生成はノーチャーン）。内部
-- ヘルパのままで authenticated には GRANT しない（revoke を再掲）。

-- ────────────────────────────────────────────────────────────
-- find_or_create_trip_place: gpid 一致 → 同名未マップ昇格 → 新規確定
-- ────────────────────────────────────────────────────────────
create or replace function public.find_or_create_trip_place(
  p_trip_id           text,
  p_member_id         uuid,
  p_google_place_id   text,
  p_name              text,
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
  v_gpid      text := nullif(trim(coalesce(p_google_place_id, '')), '');
  v_status_id uuid;
  v_place_id  uuid;
begin
  if v_gpid is null then
    raise exception 'google_place_id required';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;
  if coalesce(trim(p_formatted_address), '') = '' then
    raise exception 'address required';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'coordinates required';
  end if;

  -- 1) 同一 gpid の shared place を再利用（最も確実な同一性）
  select id into v_place_id
  from places
  where trip_id = p_trip_id
    and google_place_id = v_gpid
    and visibility = 'shared'
  order by created_at
  limit 1;

  if v_place_id is not null then
    return v_place_id;
  end if;

  -- 2) gpid 一致が無ければ、同名・未マップ・shared の既存を昇格して再利用
  --    （自由入力で先に作られた同名 place が Google 由来として確定される）。
  --    名前も Google の正規表記へ揃える（操作順に依らず最終状態を一致させ、
  --    大小・表記ゆれを正規化）。status/visibility/note/icon はユーザ設定を
  --    尊重して触らない。
  select id into v_place_id
  from places
  where trip_id = p_trip_id
    and lat is null
    and visibility = 'shared'
    and lower(name) = lower(trim(p_name))
  order by created_at
  limit 1;

  if v_place_id is not null then
    update places
    set name              = trim(p_name),
        google_place_id   = v_gpid,
        lat               = p_lat,
        lng               = p_lng,
        formatted_address = trim(p_formatted_address)
    where id = v_place_id;
    return v_place_id;
  end if;

  -- 3) どちらも無ければ確定（tentative=false）で新規作成
  select id into v_status_id
  from place_statuses
  where trip_id = p_trip_id
    and tentative = false
  order by sort_order
  limit 1;

  if v_status_id is null then
    raise exception 'confirmed status not found for this trip';
  end if;

  insert into places (
    trip_id, created_by_member_id, visibility, google_place_id,
    name, lat, lng, status_id, note, formatted_address, icon
  )
  values (
    p_trip_id, p_member_id, 'shared', v_gpid,
    trim(p_name), p_lat, p_lng, v_status_id, null,
    trim(p_formatted_address),
    coalesce(nullif(trim(coalesce(p_icon, '')), ''), 'pin')
  )
  returning id into v_place_id;

  return v_place_id;
end;
$body$;

revoke all on function public.find_or_create_trip_place(
  text, uuid, text, text, double precision, double precision, text, text
) from public;

-- ────────────────────────────────────────────────────────────
-- find_or_create_trip_freetext_place: 同名 shared を再利用
-- （Google 由来も含む。マップ済み優先）→ 無ければ未マップ・候補で新規
-- ────────────────────────────────────────────────────────────
create or replace function public.find_or_create_trip_freetext_place(
  p_trip_id    text,
  p_member_id  uuid,
  p_name       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_name      text := nullif(trim(coalesce(p_name, '')), '');
  v_status_id uuid;
  v_place_id  uuid;
begin
  if v_name is null then
    raise exception 'name required';
  end if;

  -- 同名・shared の既存を再利用（Google 由来でも可。マップ済みを優先）。
  -- 重複を作らない。逆順（Google 先 → 自由入力後）でも 1 つに収束する。
  select id into v_place_id
  from places
  where trip_id = p_trip_id
    and visibility = 'shared'
    and lower(name) = lower(v_name)
  order by (lat is not null) desc, created_at
  limit 1;

  if v_place_id is not null then
    return v_place_id;
  end if;

  -- 確定（tentative=false）。予定/費用に入れた時点で「行く/行った」は
  -- 確定済み（未確定なのは座標だけ）。Google 経路と揃え順序非依存にする。
  -- seed 済みなら必ず 1 件ある
  select id into v_status_id
  from place_statuses
  where trip_id = p_trip_id
    and tentative = false
  order by sort_order
  limit 1;

  if v_status_id is null then
    raise exception 'confirmed status not found for this trip';
  end if;

  insert into places (
    trip_id, created_by_member_id, visibility, google_place_id,
    name, lat, lng, status_id, note, formatted_address, icon
  )
  values (
    p_trip_id, p_member_id, 'shared', null,
    v_name, null, null, v_status_id, null, null, 'pin'
  )
  returning id into v_place_id;

  return v_place_id;
end;
$body$;

revoke all on function public.find_or_create_trip_freetext_place(
  text, uuid, text
) from public;
