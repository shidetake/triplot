-- transit の start_tz に非null を効かせる（制約の抜け漏れ修正）。
--
-- events_transit_endpoints_chk は end_at / end_tz / all_day しか見ておらず、
-- start_tz が null の transit を作れてしまっていた。アプリ側は必ず入れているので
-- 実害は出ていないが、コード側は「transit の startTz は必ず非null」を前提に
-- `startTz as string` とキャストしている（schedule.ts の
-- sortTransitsByDepartureInstant、placeOrder.ts の earliestVisitByPlace）。
-- 前提が DB で保証されていないので埋める。
--
-- start_tz 列そのものに not null は付けられない。normal は start_tz が null で
-- なければならない（events_normal_no_literal_tz_chk）ため、kind ごとに要件が
-- 逆になる。よって既存の transit 用 CHECK に条件を足す形にする。

alter table events
  drop constraint events_transit_endpoints_chk;

alter table events
  add constraint events_transit_endpoints_chk
    check (
      kind <> 'transit'
      or (
        start_tz is not null
        and end_at is not null
        and end_tz is not null
        and all_day = false
      )
    );
