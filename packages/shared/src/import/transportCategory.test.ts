import { describe, expect, it } from "vitest";

import { resolveTransportCategory } from "./transportCategory";
import type { TripTzTimeline } from "../schedule";

// 日本 → ホノルル → 日本。TZ が変わる移動だけが境界として並ぶ。
const abroad: TripTzTimeline = {
  fallbackTz: "Asia/Tokyo",
  transits: [
    {
      transitId: "out",
      departDate: "2026-05-01",
      arriveDate: "2026-05-01",
      departTz: "Asia/Tokyo",
      arriveTz: "Pacific/Honolulu",
      departTime: "21:25",
      arriveTime: "09:40",
    },
    {
      transitId: "back",
      departDate: "2026-05-05",
      arriveDate: "2026-05-05",
      departTz: "Pacific/Honolulu",
      arriveTz: "Asia/Tokyo",
      departTime: "11:55",
      arriveTime: "15:20",
    },
  ],
};

// 国内旅行。TZ をまたがないので境界が無い。
const domestic: TripTzTimeline = { fallbackTz: "Asia/Tokyo", transits: [] };

describe("resolveTransportCategory", () => {
  it("海外旅行の自国側の移動は渡航（行き帰りの一部）", () => {
    // 往路の新幹線 京都→東京 / 帰国後の新幹線 品川→京都
    expect(resolveTransportCategory("現地移動", "Asia/Tokyo", abroad)).toBe("渡航");
  });

  it("旅行先での移動は現地移動のまま", () => {
    // ホノルル空港→ホテルの配車、ワイキキのタクシー
    expect(resolveTransportCategory("現地移動", "Pacific/Honolulu", abroad)).toBe(
      "現地移動",
    );
  });

  it("国内旅行の国内移動は倒さない", () => {
    expect(resolveTransportCategory("現地移動", "Asia/Tokyo", domestic)).toBe(
      "現地移動",
    );
  });

  it("渡航 → 現地移動 には落とさない", () => {
    // 帰りの国際線は費用の場所が旅行先側になる。両方向にすると落ちてしまう。
    expect(resolveTransportCategory("渡航", "Pacific/Honolulu", abroad)).toBe("渡航");
  });

  it("移動以外のカテゴリは触らない", () => {
    expect(resolveTransportCategory("飲食", "Asia/Tokyo", abroad)).toBe("飲食");
    expect(resolveTransportCategory("宿泊", "Asia/Tokyo", abroad)).toBe("宿泊");
  });

  it("TZ が決まらなければ触らない", () => {
    expect(resolveTransportCategory("現地移動", null, abroad)).toBe("現地移動");
  });
});
