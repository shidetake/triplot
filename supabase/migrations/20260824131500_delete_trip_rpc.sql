-- 旅行の削除を RPC にまとめる。
--
-- 直接 `delete from trips` すると、旅行に「移動の予定」と「その移動を参照する
-- 予定・費用（＝移動日の TZ 選択を持つ行）」の両方があるときに失敗していた:
--
--   tuple to be updated was already modified by an operation triggered by
--   the current command
--
-- events の BEFORE DELETE トリガ（trg_clear_dependent_tz_disambig）が、消される
-- 移動を参照している行の tz_disambig_* を消しに行く。旅行ごとの削除では
-- その参照元の行も同じ文の cascade で消えるため、同じ行に対して「削除」と
-- 「更新」が1文の中で重なる。
--
-- トリガ自体は正しい（移動の予定を1件だけ消す通常の経路で必要。FK の
-- ON DELETE SET NULL は tz_disambig_transit_id しか NULL にできず、
-- tz_disambig_side が残るとペアの CHECK 制約に反する）。そこで、旅行を消す前に
-- その旅行の中の参照を先に外し、トリガが触る行が無い状態にしてから削除する。
create or replace function public.delete_trip(p_trip_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- RLS の trips_member_delete と同じ条件（管理者のみ）。
  if not is_trip_admin(p_trip_id) then
    raise exception 'admin required' using errcode = '42501';
  end if;

  update events
  set tz_disambig_transit_id = null, tz_disambig_side = null
  where trip_id = p_trip_id and tz_disambig_transit_id is not null;

  update expenses
  set tz_disambig_transit_id = null, tz_disambig_side = null
  where trip_id = p_trip_id and tz_disambig_transit_id is not null;

  delete from trips where id = p_trip_id;
end;
$$;

alter function public.delete_trip(text) owner to postgres;
revoke all on function public.delete_trip(text) from public;
grant all on function public.delete_trip(text) to authenticated;
