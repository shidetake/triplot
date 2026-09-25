import { describe, expect, it } from "vitest";

import { classifyLinkError, linkedProviders } from "./loginMethods";

describe("linkedProviders", () => {
  it("Google と Apple を取り出す", () => {
    expect(
      linkedProviders([{ provider: "google" }, { provider: "apple" }]),
    ).toEqual(new Set(["google", "apple"]));
  });

  it("知らない種類は無視する", () => {
    expect(linkedProviders([{ provider: "email" }, { provider: "google" }])).toEqual(
      new Set(["google"]),
    );
  });

  it("identities が無ければ空", () => {
    expect(linkedProviders(null)).toEqual(new Set());
    expect(linkedProviders(undefined)).toEqual(new Set());
  });
});

describe("classifyLinkError", () => {
  it("既に別のアカウントで使われている", () => {
    expect(classifyLinkError({ code: "identity_already_exists" })).toBe("already_used");
  });

  it("code が無くても文言で見分ける", () => {
    expect(
      classifyLinkError({ message: "Identity is already linked to another user" }),
    ).toBe("already_used");
  });

  it("それ以外", () => {
    expect(classifyLinkError({ code: "manual_linking_disabled" })).toBe("other");
    expect(classifyLinkError(null)).toBe("other");
  });
});
