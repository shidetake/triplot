import { describe, expect, it } from "vitest";

import { FEEDBACK_BODY_MAX, feedbackInputSchema } from "./feedback";

describe("feedbackInputSchema", () => {
  it("正常系: kind/body/path/locale/診断情報を受け付け、body は trim される", () => {
    const r = feedbackInputSchema.parse({
      kind: "bug",
      body: "  地図でピンが動かせない  ",
      path: "/trips/abc123",
      locale: "en",
      platform: "web",
      viewport: "1456x780",
      timezone: "Asia/Tokyo",
      theme: "dark",
    });
    expect(r).toEqual({
      kind: "bug",
      body: "地図でピンが動かせない",
      path: "/trips/abc123",
      locale: "en",
      platform: "web",
      viewport: "1456x780",
      timezone: "Asia/Tokyo",
      theme: "dark",
    });
  });

  it("locale/platform 省略時は既定値、path・診断情報は省略可", () => {
    const r = feedbackInputSchema.parse({ kind: "feature", body: "要望" });
    expect(r.locale).toBe("ja");
    expect(r.platform).toBe("web");
    expect(r.path).toBeUndefined();
    expect(r.viewport).toBeUndefined();
  });

  it("空本文・長すぎる本文・不正な kind/locale を弾く", () => {
    expect(
      feedbackInputSchema.safeParse({ kind: "bug", body: "   " }).success,
    ).toBe(false);
    expect(
      feedbackInputSchema.safeParse({
        kind: "bug",
        body: "a".repeat(FEEDBACK_BODY_MAX + 1),
      }).success,
    ).toBe(false);
    expect(
      feedbackInputSchema.safeParse({ kind: "spam", body: "x" }).success,
    ).toBe(false);
    expect(
      feedbackInputSchema.safeParse({ kind: "bug", body: "x", locale: "fr" })
        .success,
    ).toBe(false);
    expect(
      feedbackInputSchema.safeParse({
        kind: "bug",
        body: "x",
        platform: "desktop-app",
      }).success,
    ).toBe(false);
    expect(
      feedbackInputSchema.safeParse({ kind: "bug", body: "x", theme: "system" })
        .success,
    ).toBe(false);
  });
});
