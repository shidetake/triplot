import { describe, expect, it } from "vitest";

import {
  crossesTimezone,
  deriveTransitTimezones,
  timezoneOfPlace,
} from "./placeTimezone";

const NRT = { lat: 35.7719, lng: 140.3929 };
const HNL = { lat: 21.3187, lng: -157.9224 };
const SHIN_OSAKA = { lat: 34.7332, lng: 135.5003 };
const UNMAPPED = { lat: null, lng: null };

describe("timezoneOfPlace", () => {
  it("座標から IANA を引く", () => {
    expect(timezoneOfPlace(NRT)).toBe("Asia/Tokyo");
    expect(timezoneOfPlace(HNL)).toBe("Pacific/Honolulu");
  });

  it("座標が無い場所（地図未登録）は決められないので null", () => {
    expect(timezoneOfPlace(UNMAPPED)).toBeNull();
    expect(timezoneOfPlace(null)).toBeNull();
    expect(timezoneOfPlace(undefined)).toBeNull();
  });
});

describe("deriveTransitTimezones", () => {
  it("出発地・到着地それぞれから引く", () => {
    expect(deriveTransitTimezones(NRT, HNL)).toEqual({
      startTz: "Asia/Tokyo",
      endTz: "Pacific/Honolulu",
    });
  });

  it("到着地が未指定なら出発地と同じ（end_place_id の NULL と同じ意味）", () => {
    expect(deriveTransitTimezones(NRT, null)).toEqual({
      startTz: "Asia/Tokyo",
      endTz: "Asia/Tokyo",
    });
  });

  it("決められない側だけ null（UI はそこだけ聞く）", () => {
    expect(deriveTransitTimezones(NRT, UNMAPPED)).toEqual({
      startTz: "Asia/Tokyo",
      endTz: null,
    });
  });
});

describe("crossesTimezone", () => {
  it("時差があれば true（＝旅程の TZ 境界にする）", () => {
    const { startTz, endTz } = deriveTransitTimezones(NRT, HNL);
    expect(crossesTimezone(startTz, endTz)).toBe(true);
  });

  it("国内移動は false（無意味な境界を作らない）", () => {
    const { startTz, endTz } = deriveTransitTimezones(NRT, SHIN_OSAKA);
    expect(crossesTimezone(startTz, endTz)).toBe(false);
  });

  it("決められないときは境界にしない", () => {
    expect(crossesTimezone("Asia/Tokyo", null)).toBe(false);
    expect(crossesTimezone(null, "Pacific/Honolulu")).toBe(false);
  });
});
