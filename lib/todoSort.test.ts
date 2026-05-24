import { describe, expect, it } from "vitest";

import { sortTodos } from "./todoSort";

const at = "2026-01-01T00:00:00Z";

describe("sortTodos", () => {
  it("orders by priority high → medium → low", () => {
    const sorted = sortTodos([
      { priority: "low", done: false, created_at: at },
      { priority: "high", done: false, created_at: at },
      { priority: "medium", done: false, created_at: at },
    ]);
    expect(sorted.map((t) => t.priority)).toEqual(["high", "medium", "low"]);
  });

  it("breaks ties by created_at ascending (oldest first)", () => {
    const sorted = sortTodos([
      { priority: "high", done: false, created_at: "2026-01-02T00:00:00Z" },
      { priority: "high", done: false, created_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(sorted.map((t) => t.created_at)).toEqual([
      "2026-01-01T00:00:00Z",
      "2026-01-02T00:00:00Z",
    ]);
  });

  it("sinks done items below all undone items, regardless of priority", () => {
    // 未チェックの低 が チェック済みの高 より上に来る
    const sorted = sortTodos([
      { priority: "high", done: true, created_at: at },
      { priority: "low", done: false, created_at: at },
    ]);
    expect(sorted.map((t) => ({ done: t.done, priority: t.priority }))).toEqual([
      { done: false, priority: "low" },
      { done: true, priority: "high" },
    ]);
  });

  it("orders undone then done, each by priority high → medium → low", () => {
    const sorted = sortTodos([
      { priority: "low", done: true, created_at: at },
      { priority: "high", done: true, created_at: at },
      { priority: "low", done: false, created_at: at },
      { priority: "high", done: false, created_at: at },
      { priority: "medium", done: false, created_at: at },
      { priority: "medium", done: true, created_at: at },
    ]);
    expect(sorted.map((t) => `${t.done ? "x" : "o"}-${t.priority}`)).toEqual([
      "o-high",
      "o-medium",
      "o-low",
      "x-high",
      "x-medium",
      "x-low",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [
      { priority: "low" as const, done: false, created_at: at },
      { priority: "high" as const, done: false, created_at: at },
    ];
    const copy = [...input];
    sortTodos(input);
    expect(input).toEqual(copy);
  });
});
