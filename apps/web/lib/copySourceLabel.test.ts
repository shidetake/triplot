import { describe, expect, it } from "vitest";

import { buildCopySourceLabels, type CopySourceTrip } from "./copySourceLabel";

function trip(p: Partial<CopySourceTrip> & { id: string }): CopySourceTrip {
  return {
    title: "Hawaii",
    start_date: "2026-06-01",
    end_date: "2026-06-07",
    ...p,
  };
}

describe("buildCopySourceLabels", () => {
  it("年と日数を付ける（両端含む 7 日間）", () => {
    const labels = buildCopySourceLabels([trip({ id: "a" })]);
    expect(labels.get("a")).toBe("Hawaii (2026, 7日間)");
  });

  it("1 日旅行は 1日間", () => {
    const labels = buildCopySourceLabels([
      trip({ id: "a", start_date: "2026-06-01", end_date: "2026-06-01" }),
    ]);
    expect(labels.get("a")).toBe("Hawaii (2026, 1日間)");
  });

  it("同名でも年が違えば年だけ", () => {
    const labels = buildCopySourceLabels([
      trip({ id: "a", start_date: "2026-06-01", end_date: "2026-06-07" }),
      trip({ id: "b", start_date: "2025-03-01", end_date: "2025-03-05" }),
    ]);
    expect(labels.get("a")).toBe("Hawaii (2026, 7日間)");
    expect(labels.get("b")).toBe("Hawaii (2025, 5日間)");
  });

  it("同名・同年が複数あると月も足す", () => {
    const labels = buildCopySourceLabels([
      trip({ id: "a", start_date: "2026-06-01", end_date: "2026-06-07" }),
      trip({ id: "b", start_date: "2026-12-20", end_date: "2026-12-25" }),
    ]);
    expect(labels.get("a")).toBe("Hawaii (2026/6, 7日間)");
    expect(labels.get("b")).toBe("Hawaii (2026/12, 6日間)");
  });

  it("月の曖昧化は同名グループ内だけ（別タイトルには波及しない）", () => {
    const labels = buildCopySourceLabels([
      trip({ id: "a", start_date: "2026-06-01", end_date: "2026-06-07" }),
      trip({ id: "b", start_date: "2026-12-20", end_date: "2026-12-25" }),
      trip({ id: "c", title: "Guam", start_date: "2026-06-10", end_date: "2026-06-14" }),
    ]);
    expect(labels.get("a")).toBe("Hawaii (2026/6, 7日間)");
    expect(labels.get("b")).toBe("Hawaii (2026/12, 6日間)");
    expect(labels.get("c")).toBe("Guam (2026, 5日間)");
  });

  it("start_date が無ければ素のタイトル", () => {
    const labels = buildCopySourceLabels([
      trip({ id: "a", start_date: null, end_date: null }),
    ]);
    expect(labels.get("a")).toBe("Hawaii");
  });

  it("end_date だけ無ければ年のみ（日数は出さない）", () => {
    const labels = buildCopySourceLabels([
      trip({ id: "a", start_date: "2026-06-01", end_date: null }),
    ]);
    expect(labels.get("a")).toBe("Hawaii (2026)");
  });
});
