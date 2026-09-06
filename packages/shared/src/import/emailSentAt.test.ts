import { describe, expect, it } from "vitest";

import { emailSentAt } from "./emailSentAt";

// 実データの形（scripts/forward-gmail.mjs が組み立てる転送本文）。
const forwarded = (dateLine: string) =>
  [
    "---------- Forwarded message ---------",
    "From: banking@example.jp",
    `Date: ${dateLine}`,
    "Subject: ご利用のお知らせ",
    "To: me@example.com",
    "",
    "カード利用日：2026年4月29日",
  ].join("\n");

describe("emailSentAt", () => {
  it("転送ブロックの ISO 表記から元のメールの瞬間を取る", () => {
    expect(emailSentAt("2026-09-06T05:25:31.000Z", forwarded("2026-04-29T02:38:23.000Z"))).toBe(
      "2026-04-29T02:38:23.000Z",
    );
  });

  it("転送ブロックの RFC 5322 表記も読む", () => {
    expect(
      emailSentAt(null, forwarded("Wed, 29 Apr 2026 11:38:23 +0900")),
    ).toBe("2026-04-29T02:38:23.000Z");
  });

  it("末尾の註記（JST）が付いていても読む", () => {
    expect(
      emailSentAt(null, forwarded("Wed, 29 Apr 2026 11:38:23 +0900 (JST)")),
    ).toBe("2026-04-29T02:38:23.000Z");
  });

  // Gmail が手動転送で書く日付。どのタイムゾーンで描画したかが文字列に無い。
  it("オフセットの無い表記は読まない（転送時刻で代用もしない）", () => {
    expect(
      emailSentAt("2026-09-06T05:25:31.000Z", forwarded("2026年4月29日(水) 11:38")),
    ).toBeNull();
  });

  it("転送でなければ自分の Date ヘッダーを使う", () => {
    expect(emailSentAt("2026-04-29T02:38:23.000Z", "カード利用日：2026年4月29日")).toBe(
      "2026-04-29T02:38:23.000Z",
    );
  });

  it("手がかりが無ければ null", () => {
    expect(emailSentAt(null, "カード利用日：2026年4月29日")).toBeNull();
  });

  // 本文中の "Date: 04/29/2026" のような行を転送ヘッダーと取り違えない。
  it("転送ブロックの外の日付らしき行は拾わない", () => {
    expect(emailSentAt(null, "Order Date: 04/29/2026\nTotal: $12")).toBeNull();
  });
});
