import { APICallError } from "ai";
import { describe, expect, it } from "vitest";

import { classifyFailure } from "./process";

// 失敗の分類。ここが崩れると「クレジットが尽きたのに再試行し続ける」「レート制限
// なのに行を諦める」といった質の違う事故になるので、境界を固定しておく。
function apiError(statusCode: number, message = "boom") {
  return new APICallError({
    message,
    url: "https://ai-gateway.vercel.sh/v1/chat/completions",
    requestBodyValues: {},
    statusCode,
  });
}

describe("classifyFailure", () => {
  it("429 はレート制限（時間で解ける）", () => {
    expect(classifyFailure(apiError(429))).toBe("rate_limit");
  });

  it("5xx と 408 は一時障害", () => {
    expect(classifyFailure(apiError(500))).toBe("transient");
    expect(classifyFailure(apiError(503))).toBe("transient");
    expect(classifyFailure(apiError(408))).toBe("transient");
  });

  it("その他の 4xx は恒久失敗（再試行しても無駄）", () => {
    expect(classifyFailure(apiError(400))).toBe("permanent");
    expect(classifyFailure(apiError(401))).toBe("permanent");
    expect(classifyFailure(apiError(403))).toBe("permanent");
  });

  it("クレジット枯渇（402）をレート制限と取り違えない", () => {
    // 文面はレート制限と紛らわしい（"free tier" / "credits" を含む）。
    // ステータスで判定しているので巻き込まれない。
    const err = apiError(
      402,
      "Free tier requests on this model are rate-limited. Upgrade to paid credits.",
    );
    expect(classifyFailure(err)).toBe("permanent");
  });

  it("実際に観測した 429 の文面もレート制限として拾う", () => {
    const err = apiError(
      429,
      "Free tier requests on this model are rate-limited. Upgrade to paid credits.",
    );
    expect(classifyFailure(err)).toBe("rate_limit");
  });

  it("APICallError でなければ文字列から拾う", () => {
    expect(classifyFailure(new Error("Rate limit exceeded"))).toBe("rate_limit");
    expect(classifyFailure(new Error("429 Too Many Requests"))).toBe("rate_limit");
    expect(classifyFailure(new Error("fetch failed"))).toBe("transient");
    expect(classifyFailure(new Error("ETIMEDOUT"))).toBe("transient");
    expect(classifyFailure(new Error("upstream 503"))).toBe("transient");
  });

  it("見当のつかないものは unknown（一時扱いだが MAX_RETRIES で蓋をする側）", () => {
    expect(classifyFailure(new Error("something odd"))).toBe("unknown");
    expect(classifyFailure(undefined)).toBe("unknown");
  });
});
