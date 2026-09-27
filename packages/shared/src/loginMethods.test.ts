import { describe, expect, it } from "vitest";

import {
  classifyLinkError,
  classifyLinkFailure,
  linkedProviders,
} from "./loginMethods";

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

describe("classifyLinkFailure", () => {
  it("照合の失敗はこちら側の不具合（既に使われている、にはしない）", () => {
    expect(
      classifyLinkFailure({
        error: "server_error",
        code: "unexpected_failure",
        description: "Unable to exchange external code: c2a7",
      }),
    ).toBe("unavailable");
  });

  it("既に別のアカウントで使われている", () => {
    expect(classifyLinkFailure({ code: "identity_already_exists" })).toBe("already_used");
  });

  it("大分類が server_error でも、既に使われているなら already_used", () => {
    // 実際に本番で返ってきた形。
    expect(
      classifyLinkFailure({
        error: "server_error",
        code: "identity_already_exists",
        description: "Identity is already linked to another user",
      }),
    ).toBe("already_used");
  });

  it("キャンセル", () => {
    expect(classifyLinkFailure({ error: "access_denied" })).toBe("canceled");
  });

  it("それ以外", () => {
    expect(classifyLinkFailure({ error: "invalid_request" })).toBe("other");
  });
});
