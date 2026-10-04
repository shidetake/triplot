-- 20261002000000 で TODO の旧担当者の複合外部キー（todos → trip_members(id, trip_id)）
-- のために足した一意性の制約。その外部キーは 20261004010000 で列ごと消したので、
-- 使い道がなくなった（id が主キーなので、この制約が守るものも他に無い）。
alter table public.trip_members drop constraint if exists trip_members_id_trip_id_key;
