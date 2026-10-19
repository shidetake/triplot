-- 終日の予定に「両方」（日付が同じまま2列になる便の日を、2列とも覆う）を選べるようにする。
--
-- 便の出発日と到着日が同じ日付で、その日が出発側・到着側の2列になる時、その日1日だけの
-- 終日の予定は「出発側」「到着側」「両方」のどれもあり得る（誕生日・移動日のメモは両方、
-- 出発準備は出発側、現地の1日券は到着側）。本人が選んだ「両方」を値として残す。
-- null は「選んでいない」のまま（表示は規則で決める）。選んだものを null で持つと、
-- あとで既定の規則を変えた時に本人の選択まで動いてしまう。
--
-- 「両方」は予定の終日だけ。費用は時刻を持つので、どちらかの側に必ず決まる
-- （費用の CHECK 制約は変えない）。

alter table public.events drop constraint events_tz_disambig_side_check;
alter table public.events add constraint events_tz_disambig_side_check check (
  tz_disambig_side = any (array['depart'::text, 'arrive'::text])
  or (tz_disambig_side = 'both' and all_day)
);

-- 予定と費用の保存で共用している検証。'both' を通し、予定か費用か・終日かは
-- 各テーブルの CHECK 制約に任せる。
CREATE OR REPLACE FUNCTION "public"."validate_tz_disambig"("p_trip_id" "text", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_tz_disambig_side is not null and p_tz_disambig_side not in ('depart', 'arrive', 'both') then
    raise exception 'invalid tz_disambig_side';
  end if;
  if (p_tz_disambig_transit_id is null) <> (p_tz_disambig_side is null) then
    raise exception 'tz_disambig_transit_id and tz_disambig_side must be set together';
  end if;
  if p_tz_disambig_transit_id is not null and not exists (
    select 1 from events
    where id = p_tz_disambig_transit_id
      and trip_id = p_trip_id
      and kind = 'transit'
  ) then
    raise exception 'tz_disambig_transit_id does not belong to this trip';
  end if;
end;
$$;
