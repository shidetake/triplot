import { describe, expect, it } from "vitest";

import { FEEDBACK_BODY_MAX, feedbackInputSchema } from "./feedback";

describe("feedbackInputSchema", () => {
  it("正常系: kind/body/path/locale を受け付け、body は trim される", () => {
    const r = feedbackInputSchema.parse({
      kind: "bug",
      body: "  地図でピンが動かせない  ",
      path: "/trips/abc123",
      locale: "en",
    });
    expect(r).toEqual({
      kind: "bug",
      body: "地図でピンが動かせない",
      path: "/trips/abc123",
      locale: "en",
    });
  });

  it("locale 省略時は ja、path は省略可", () => {
    const r = feedbackInputSchema.parse({ kind: "feature", body: "要望" });
    expect(r.locale).toBe("ja");
    expect(r.path).toBeUndefined();
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
  });
});
