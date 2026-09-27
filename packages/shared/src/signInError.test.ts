import { describe, expect, it } from "vitest";

import { classifySignInError } from "./signInError";

describe("classifySignInError", () => {
  it("Supabase と Apple の照合の失敗はこちら側の不具合", () => {
    // 実際に本番で返ってきた形（鍵の期限切れ）。
    expect(
      classifySignInError({
        error: "server_error",
        code: "unexpected_failure",
        description: "Unable to exchange external code: cb30",
      }),
    ).toBe("unavailable");
  });

  it("ログイン方法が無効もこちら側の不具合", () => {
    expect(
      classifySignInError({ description: "Unsupported provider: provider is not enabled" }),
    ).toBe("unavailable");
  });

  it("利用者のキャンセル", () => {
    expect(classifySignInError({ error: "access_denied" })).toBe("canceled");
    expect(classifySignInError({ description: "user_cancelled_authorize" })).toBe(
      "canceled",
    );
  });

  it("大分類が server_error でも、詳しい理由が別ならこちら側の不具合にしない", () => {
    // 実際に本番で返ってきた形（既に別のアカウントで使われている Apple を追加）。
    expect(
      classifySignInError({
        error: "server_error",
        code: "identity_already_exists",
        description: "Identity is already linked to another user",
      }),
    ).toBe("retry");
  });

  it("それ以外はやり直し", () => {
    expect(classifySignInError({})).toBe("retry");
    expect(classifySignInError({ error: "invalid_request" })).toBe("retry");
  });
});
