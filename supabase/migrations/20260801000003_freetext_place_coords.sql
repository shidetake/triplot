-- 自由入力の場所に座標とアイコンを持たせられるようにする。
--
-- フライト番号から予定を作ると、空港の**正確な座標が手元にある**（提供元が
-- 緯度経度を返す）。ところが自由入力の経路は名前しか受け取れず、空港が
-- 「地図未登録」の場所として入ってしまう。地図にピンが立たず、訪問順の
-- 並べ替え（placeOrder）でも座標を持つ場所として扱えない。
--
-- Google 由来の経路は使えない。google_place_id が無いためで、places の
-- CHECK（places_google_complete_chk）もそれを許さない。かといって「空港」専用の
-- 変種を足すと、次に別の外部データ源が来たときにまた増える。
--
-- **座標は名前に付随する任意の属性**として扱う。自由入力＝「Google 以外の出所で
-- 名前が分かっている場所」であり、そこに座標も分かっているかどうかの違いしかない。
-- 重複解決（同名で寄せる）も従来と同じ規則でよい。
--
-- 既存の場所に座標が無く、後から座標つきで同じ名前が来たら**埋める**。
-- 「地図未登録」だった場所が地図に乗るのは純粋な改善で、失うものが無い。

drop function if exists public.find_or_create_trip_freetext_place(text, uuid, text);

create or replace function public.find_or_create_trip_freetext_place(
  p_trip_id    text,
  p_member_id  uuid,
  p_name       text,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_icon       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_name     text := nullif(trim(coalesce(p_name, '')), '');
  v_place_id uuid;
  v_has_geo  boolean := p_lat is not null and p_lng is not null;
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
    -- 座標を持たない既存に、分かった座標を後から与える。
    if v_has_geo then
      update places
      set lat  = p_lat,
          lng  = p_lng,
          icon = case when icon = 'pin' then coalesce(p_icon, icon) else icon end
      where id = v_place_id
        and lat is null;
    end if;
    return v_place_id;
  end if;

  insert into places (
    trip_id, created_by_member_id, visibility, name, lat, lng, icon
  )
  values (
    p_trip_id, p_member_id, 'shared', v_name,
    p_lat, p_lng, coalesce(p_icon, 'pin')
  )
  returning id into v_place_id;

  return v_place_id;
end;
$body$;

revoke all on function public.find_or_create_trip_freetext_place(
  text, uuid, text, double precision, double precision, text
) from public;

-- ────────────────────────────────────────────────────────────
-- resolve_place_spec の freetext 枝で座標・アイコンを受け渡す。
--   {"freetext": {"name": "成田国際空港", "lat": 35.76, "lng": 140.38,
--                 "icon": "airport"}}
-- lat/lng/icon は任意。無ければ従来どおり名前だけの場所になる。
-- ────────────────────────────────────────────────────────────
create or replace function public.resolve_place_spec(
  p_trip_id    text,
  p_member_id  uuid,
  p_spec       jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_place_id uuid;
  v_ok       boolean;
  v_google   jsonb;
  v_free     jsonb;
begin
  if p_spec is null or p_spec = 'null'::jsonb then
    return null;
  end if;

  if p_spec ? 'place_id' then
    v_place_id := (p_spec ->> 'place_id')::uuid;
    if v_place_id is null then
      return null;
    end if;
    select exists (
      select 1 from places where id = v_place_id and trip_id = p_trip_id
    ) into v_ok;
    if not v_ok then
      raise exception 'place does not belong to this trip';
    end if;
    return v_place_id;
  end if;

  if p_spec ? 'google' then
    v_google := p_spec -> 'google';
    return public.find_or_create_trip_place(
      p_trip_id,
      p_member_id,
      v_google ->> 'google_place_id',
      v_google ->> 'name',
      (v_google ->> 'lat')::double precision,
      (v_google ->> 'lng')::double precision,
      v_google ->> 'formatted_address',
      v_google ->> 'icon',
      v_google ->> 'region',
      v_google ->> 'locality'
    );
  end if;

  if p_spec ? 'freetext' then
    v_free := p_spec -> 'freetext';
    return public.find_or_create_trip_freetext_place(
      p_trip_id,
      p_member_id,
      v_free ->> 'name',
      (v_free ->> 'lat')::double precision,
      (v_free ->> 'lng')::double precision,
      nullif(v_free ->> 'icon', '')
    );
  end if;

  raise exception 'invalid place spec';
end;
$body$;
