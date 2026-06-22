import { describe, expect, it } from "vitest";

import { formatYmd, parseYmd } from "./ymd";

describe("parseYmd", () => {
  it("parses a valid date string to a local-midnight Date", () => {
    const d = parseYmd("2026-04-27")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // 0-based April
    expect(d.getDate()).toBe(27);
    expect(d.getHours()).toBe(0);
  });

  it("returns undefined for empty / null / malformed", () => {
    expect(parseYmd(undefined)).toBeUndefined();
    expect(parseYmd(null)).toBeUndefined();
    expect(parseYmd("")).toBeUndefined();
    expect(parseYmd("not-a-date")).toBeUndefined();
  });
});

describe("formatYmd", () => {
  it("zero-pads month and day", () => {
    expect(formatYmd(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatYmd(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("returns empty string for undefined", () => {
    expect(formatYmd(undefined)).toBe("");
  });

  it("round-trips with parseYmd", () => {
    expect(formatYmd(parseYmd("2026-07-09"))).toBe("2026-07-09");
  });
});
