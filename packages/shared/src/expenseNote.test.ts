import { describe, expect, it } from "vitest";

import { expenseNoteSlot } from "./expenseNote";

describe("expenseNoteSlot", () => {
  it("場所が無いならメモは場所の枠に出す（1行減る）", () => {
    expect(expenseNoteSlot({ placeName: null, note: "レシートなし" })).toBe(
      "place",
    );
  });

  it("場所があるならメモは自分の段に出す", () => {
    expect(expenseNoteSlot({ placeName: "ABC Store", note: "お土産" })).toBe(
      "own",
    );
  });

  it("メモが無ければ出さない", () => {
    expect(expenseNoteSlot({ placeName: null, note: null })).toBe("none");
    expect(expenseNoteSlot({ placeName: "ABC Store", note: "" })).toBe("none");
  });

  it("空白だけのメモは無いものとして扱う（空の段を作らない）", () => {
    expect(expenseNoteSlot({ placeName: null, note: "   " })).toBe("none");
  });
});
