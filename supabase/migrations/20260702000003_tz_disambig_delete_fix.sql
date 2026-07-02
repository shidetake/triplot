-- バグ修正: 乗継(transit)を削除すると events_tz_disambig_pair_chk 違反で失敗していた。
--
-- events/expenses.tz_disambig_transit_id は `references events(id) on delete set null`
-- だが、対になっている tz_disambig_side はこの FK の対象外なので削除時に null化されず、
-- 「transit_id は null・side は non-null」というペア制約違反の中間状態が生まれていた
-- （FK の SET NULL は削除に伴う暗黙の UPDATE で、ペア制約は immediate なのでその場で失敗する）。
--
-- 削除される transit を参照している行は、削除前に BEFORE DELETE トリガーで
-- tz_disambig_transit_id/side を「同じ UPDATE 文で」まとめて null化する（片方だけ更新する
-- 中間状態を作らない）。これで実際の DELETE 到達時には参照が残っておらず、
-- FK 自体の SET NULL は対象0件の no-op になる。

create or replace function public.clear_dependent_tz_disambig()
returns trigger
language plpgsql
security definer
set search_path = public
as $body$
begin
  update events
  set tz_disambig_transit_id = null,
      tz_disambig_side = null
  where tz_disambig_transit_id = old.id;

  update expenses
  set tz_disambig_transit_id = null,
      tz_disambig_side = null
  where tz_disambig_transit_id = old.id;

  return old;
end;
$body$;

drop trigger if exists trg_clear_dependent_tz_disambig on events;

create trigger trg_clear_dependent_tz_disambig
  before delete on events
  for each row
  when (old.kind = 'transit')
  execute function public.clear_dependent_tz_disambig();
