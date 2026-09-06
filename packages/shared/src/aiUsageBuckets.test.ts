import { describe, expect, it } from "vitest";

import {
  bucketStart,
  buildUsageBuckets,
  recentBucketStarts,
} from "./aiUsageBuckets";

// ローカル日付で扱う（管理者が見るのは自分の時計での「今日」）。
const d = (s: string) => new Date(`${s}T12:00:00`);
// 日別カウンタの1行ぶん。
const c = (day: string, count = 1) => ({ day, count });

describe("bucketStart", () => {
  it("日別はその日", () => {
    expect(bucketStart(d("2026-09-06"), "day")).toBe("2026-09-06");
  });

  it("週別は月曜始まり", () => {
    // 2026-09-06 は日曜。ISO 8601 では前週の月曜（8/31）に属する。
    expect(bucketStart(d("2026-09-06"), "week")).toBe("2026-08-31");
    expect(bucketStart(d("2026-08-31"), "week")).toBe("2026-08-31");
    expect(bucketStart(d("2026-09-07"), "week")).toBe("2026-09-07");
  });

  it("月別は1日", () => {
    expect(bucketStart(d("2026-09-06"), "month")).toBe("2026-09-01");
  });
});

describe("recentBucketStarts", () => {
  it("古い順に返す（グラフの時間の向きに揃える）", () => {
    expect(recentBucketStarts(d("2026-09-06"), "day", 3)).toEqual([
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  it("週別は7日刻み", () => {
    expect(recentBucketStarts(d("2026-09-06"), "week", 3)).toEqual([
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
    ]);
  });

  it("月別は月をまたぐ（年またぎも）", () => {
    expect(recentBucketStarts(d("2026-01-15"), "month", 3)).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
    ]);
  });
});

describe("buildUsageBuckets", () => {
  const now = d("2026-09-06");

  it("バケットごとに数え、単価を掛ける", () => {
    const buckets = buildUsageBuckets(
      [c("2026-09-06", 2), c("2026-09-05", 1)],
      { now, granularity: "day", bucketCount: 3, perEmailUsd: 0.02 },
    );
    expect(buckets).toEqual([
      { start: "2026-09-04", count: 0, cost: 0 },
      { start: "2026-09-05", count: 1, cost: 0.02 },
      { start: "2026-09-06", count: 2, cost: 0.04 },
    ]);
  });

  it("抽出が無いバケットも0で埋める", () => {
    // 歯抜けだと「使わなかった」と「データが無い」の区別が付かない。
    const buckets = buildUsageBuckets([], {
      now,
      granularity: "day",
      bucketCount: 2,
      perEmailUsd: 0.02,
    });
    expect(buckets.map((b) => b.count)).toEqual([0, 0]);
  });

  it("単価が出せなければコストは null（0 にしない）", () => {
    // 0 と「分からない」は別。0 だと「使っていない」に見える。
    const buckets = buildUsageBuckets([c("2026-09-06")], {
      now,
      granularity: "day",
      bucketCount: 1,
      perEmailUsd: null,
    });
    expect(buckets[0]).toEqual({ start: "2026-09-06", count: 1, cost: null });
  });

  it("期間外の抽出は数えない", () => {
    const buckets = buildUsageBuckets([c("2026-08-01")], {
      now,
      granularity: "day",
      bucketCount: 3,
      perEmailUsd: 0.02,
    });
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });
});

describe("日別カウンタの束ね方", () => {
  it("週別は複数日ぶんを足し合わせる", () => {
    // 2026-08-31(月)〜09-06(日) が同じ週。
    const buckets = buildUsageBuckets(
      [c("2026-08-31", 10), c("2026-09-03", 5), c("2026-09-06", 2)],
      {
        now: d("2026-09-06"),
        granularity: "week",
        bucketCount: 1,
        perEmailUsd: 0.02,
      },
    );
    expect(buckets[0]).toEqual({ start: "2026-08-31", count: 17, cost: 0.34 });
  });

  it("月別も同様", () => {
    const buckets = buildUsageBuckets(
      [c("2026-09-01", 3), c("2026-09-30", 4)],
      {
        now: d("2026-09-30"),
        granularity: "month",
        bucketCount: 1,
        perEmailUsd: 0.02,
      },
    );
    expect(buckets[0].count).toBe(7);
  });

  it("日付はローカルとして読む（UTC 扱いで前日にずらさない）", () => {
    // new Date("2026-09-06") は UTC 0時＝日本時間では 9/6 9:00 だが、
    // タイムゾーンによっては前日になる。文字列を分解して読む必要がある。
    const buckets = buildUsageBuckets([c("2026-09-06", 1)], {
      now: d("2026-09-06"),
      granularity: "day",
      bucketCount: 1,
      perEmailUsd: null,
    });
    expect(buckets[0].count).toBe(1);
  });
});
