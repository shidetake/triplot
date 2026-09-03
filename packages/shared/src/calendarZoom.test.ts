import { describe, expect, it } from "vitest";

import {
  maxHourPx,
  zoomAnchoredScrollY,
  zoomedHourPx,
  ZOOM_MAX_VISIBLE_HOURS,
} from "./calendarZoom";

const MIN = 30;

describe("maxHourPx", () => {
  it("画面に6時間ぶんが入る高さが上限", () => {
    expect(maxHourPx(510, MIN)).toBeCloseTo(85);
    expect(510 / maxHourPx(510, MIN)).toBeCloseTo(ZOOM_MAX_VISIBLE_HOURS);
  });

  it("測れていなければ既定の3倍で仮置き", () => {
    expect(maxHourPx(0, MIN)).toBe(90);
  });

  it("6時間ぶんが既定より小さくなる端末でも既定を下回らない", () => {
    // 高さ 120pt（分割表示等）だと 20px/時 になり、既定より引いた状態になる。
    expect(maxHourPx(120, MIN)).toBe(MIN);
  });
});

describe("zoomedHourPx", () => {
  it("既定より引けない（既定＝最小）", () => {
    expect(zoomedHourPx(MIN, 0.5, MIN, 85)).toBe(MIN);
  });

  it("上限で止まる", () => {
    expect(zoomedHourPx(MIN, 10, MIN, 85)).toBe(85);
  });

  it("その間は連続的に変わる", () => {
    expect(zoomedHourPx(MIN, 2, MIN, 85)).toBe(60);
  });

  it("倍率はピンチ開始時の値に掛ける", () => {
    // 同じ scale で2回呼んでも同じ値（前回値に掛けると発散する）。
    expect(zoomedHourPx(MIN, 1.5, MIN, 85)).toBe(zoomedHourPx(MIN, 1.5, MIN, 85));
  });
});

describe("zoomAnchoredScrollY", () => {
  const viewportH = 510;

  it("指の間の時刻が同じ高さに残る", () => {
    // 12:00 が画面の上から 200pt の位置にある状態で拡大する。
    const y = zoomAnchoredScrollY({
      focalMin: 12 * 60,
      focalY: 200,
      hourPx: 60,
      viewportH,
    });
    // 拡大後も 12:00 が 200pt の位置に来る。
    expect((12 * 60) / 60 * 60 - y).toBeCloseTo(200);
  });

  it("上端を越えない", () => {
    expect(
      zoomAnchoredScrollY({ focalMin: 30, focalY: 400, hourPx: 60, viewportH }),
    ).toBe(0);
  });

  it("下端を越えない", () => {
    const y = zoomAnchoredScrollY({
      focalMin: 23 * 60 + 30,
      focalY: 10,
      hourPx: 85,
      viewportH,
    });
    expect(y).toBe(24 * 85 - viewportH);
  });
});

