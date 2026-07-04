import { describe, expect, it, vi } from "vitest";

import { appendLinkText, gatherReceiptText } from "./pipeline";

// 最小の生 MIME（text/plain）。
function rawEmail(body: string): string {
  return ["From: a@b.com", "Subject: receipt", "", body].join("\r\n");
}

describe("appendLinkText", () => {
  it("本文の後ろに区切り付きでリンク先テキストを足す（前後の空白は落とす）", () => {
    expect(appendLinkText("本文", "https://a.com/r", "  明細 $5  ")).toBe(
      "本文\n\n--- リンク先(https://a.com/r) ---\n明細 $5",
    );
  });
});

describe("gatherReceiptText", () => {
  it("fetchLink 未指定なら本文だけ返す", async () => {
    const r = await gatherReceiptText(
      rawEmail("buy https://squareup.com/r/ABC"),
    );
    expect(r.text).toContain("https://squareup.com/r/ABC");
    expect(r.text).not.toContain("リンク先");
  });

  it("許可ドメインのリンクを fetchLink で取得して本文に付加する", async () => {
    const fetchLink = vi.fn(async () => "ITEM コーヒー $5.00");
    const r = await gatherReceiptText(
      rawEmail("receipt https://squareup.com/r/ABC"),
      { fetchLink },
    );
    expect(fetchLink).toHaveBeenCalledWith("https://squareup.com/r/ABC");
    expect(r.text).toContain("--- リンク先(https://squareup.com/r/ABC) ---");
    expect(r.text).toContain("ITEM コーヒー $5.00");
  });

  it("許可外ドメインのリンクは取得しない", async () => {
    const fetchLink = vi.fn(async () => "x");
    await gatherReceiptText(rawEmail("track https://evil.com/r/ABC"), {
      fetchLink,
    });
    expect(fetchLink).not.toHaveBeenCalled();
  });

  it("取得失敗(null)なら本文だけで続行", async () => {
    const fetchLink = vi.fn(async () => null);
    const r = await gatherReceiptText(
      rawEmail("receipt https://squareup.com/r/ABC"),
      { fetchLink },
    );
    expect(r.text).not.toContain("リンク先");
  });
});
