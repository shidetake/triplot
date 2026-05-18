-- places: 「必ず Google 由来・必ず地図に出る」固定から 3 状態へ緩める。
--
-- 背景:
--  - これまで places は google_place_id / lat / lng / formatted_address が
--    全て NOT NULL ＝「必ず Google 検索由来・必ず地図に出る」を強制し、
--    自由入力は places に入れず events.place_label に逃がしていた。
--  - 場所を「唯一の真実」に一本化する（自由入力も places、費用にも場所、
--    地図から手動ピン）方針へ転換する。その土台として places を緩める。
--
-- 3 状態:
--  (1) Google 由来 … gpid + lat/lng + formatted_address すべて有り（従来）
--  (2) 未マップ    … name のみ。座標が無いので地図にピンが出ない（自由入力）
--  (3) 手動ピン    … lat/lng 有り・gpid/住所無し（地図上で任意に置いた点）
--
-- 「マップ済みか」は lat IS NULL で素直に判定する（status/tentative には
-- 相乗りさせない。status は "行くか" であって "場所が判ってるか" ではない）。
--
-- CHECK で守る不変条件:
--  - 座標は対で入る or 対で無い（lat だけ / lng だけは不正）
--  - Google 由来（gpid 有り）なら必ず座標と住所が揃う
--
-- このステップでは新しい作成経路は足さない（create_place は据え置きで
-- 従来通り Google 由来必須のまま。手動ピン / 自由入力の作成緩和は後続）。
-- 既存 places は全て Google 由来で上記 CHECK を満たすので truncate 不要。

alter table places alter column google_place_id   drop not null;
alter table places alter column lat               drop not null;
alter table places alter column lng               drop not null;
alter table places alter column formatted_address drop not null;

alter table places
  add constraint places_coords_pair_chk
    check ((lat is null) = (lng is null)),
  add constraint places_google_complete_chk
    check (
      google_place_id is null
      or (lat is not null and formatted_address is not null)
    );
