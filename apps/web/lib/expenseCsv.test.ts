import { describe, it, expect } from "vitest";

import { buildExpensesCsv, type ExpenseCsvRow } from "./expenseCsv";

const row = (over: Partial<ExpenseCsvRow> = {}): ExpenseCsvRow => ({
  date: "2026-05-01",
  category: "飲食",
  payer: "たけ",
  localAmount: 1200,
  localCurrency: "JPY",
  defaultAmount: 1200,
  defaultCurrency: "JPY",
  splittable: true,
  visibility: "shared",
  place: "",
  note: "",
  ...over,
});

describe("buildExpensesCsv", () => {
  it("BOM 付きで始まりヘッダ行を持つ", () => {
    const out = buildExpensesCsv([]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain("日付,カテゴリ,支払者");
  });

  it("CRLF 区切りで行を出す", () => {
    const out = buildExpensesCsv([row()]);
    const lines = out.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toContain("日付");
    expect(lines[1]).toBe(
      "2026-05-01,飲食,たけ,1200,JPY,1200,JPY,割り勘,共有,,",
    );
  });

  it("splittable と visibility を日本語ラベルに", () => {
    const out = buildExpensesCsv([
      row({ splittable: false, visibility: "private" }),
    ]);
    expect(out).toContain(",個人,プライベート,");
  });

  it("カンマ・引用符・改行を含むセルをクォートしエスケープ", () => {
    const out = buildExpensesCsv([
      row({ note: 'a,b "c"\nd', place: "東京, 駅" }),
    ]);
    expect(out).toContain('"東京, 駅"');
    expect(out).toContain('"a,b ""c""\nd"');
  });
});
