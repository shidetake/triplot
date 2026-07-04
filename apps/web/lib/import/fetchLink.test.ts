import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchReceiptLink, isTextContentType } from "./fetchLink";

// DNS 解決をモック（既定はパブリック IP）。SSRF ガードのテストで差し替える。
const lookupMock = vi.hoisted(() =>
  vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
);
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

describe("isTextContentType", () => {
  it("html/plain/xhtml を通す（charset 付きも）", () => {
    expect(isTextContentType("text/html")).toBe(true);
    expect(isTextContentType("text/html; charset=utf-8")).toBe(true);
    expect(isTextContentType("text/plain")).toBe(true);
    expect(isTextContentType("application/xhtml+xml")).toBe(true);
  });
  it("バイナリ・不明は弾く", () => {
    expect(isTextContentType("application/pdf")).toBe(false);
    expect(isTextContentType("image/png")).toBe(false);
    expect(isTextContentType("application/octet-stream")).toBe(false);
    expect(isTextContentType(null)).toBe(false);
  });
});

describe("fetchReceiptLink", () => {
  it("既定（許可ホスト必須）では未許可ホストを fetch せず null", async () => {
    const fetchMock = vi.fn(async () => htmlResponse("<p>x</p>"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchReceiptLink("https://toasttab.com/r/A")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requireAllowedHost: false なら未許可ホストも取得できる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => htmlResponse("<p>ITEM コーヒー $5.00</p>")),
    );
    const text = await fetchReceiptLink("https://toasttab.com/r/A", {
      requireAllowedHost: false,
    });
    expect(text).toContain("ITEM コーヒー $5.00");
  });

  it("未許可ホストモードでも https 以外は拒否", async () => {
    const fetchMock = vi.fn(async () => htmlResponse("<p>x</p>"));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await fetchReceiptLink("http://toasttab.com/r/A", {
        requireAllowedHost: false,
      }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("未許可ホストモードでも内部向け IP に解決されるホストは拒否", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    const fetchMock = vi.fn(async () => htmlResponse("<p>x</p>"));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await fetchReceiptLink("https://metadata.example.com/", {
        requireAllowedHost: false,
      }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("テキスト系以外の content-type は捨てる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("%PDF-1.7", {
            status: 200,
            headers: { "content-type": "application/pdf" },
          }),
      ),
    );
    expect(
      await fetchReceiptLink("https://toasttab.com/r/A.pdf", {
        requireAllowedHost: false,
      }),
    ).toBeNull();
  });

  it("リダイレクト先も再検証する（内部向けへの飛ばしを拒否）", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://internal.example.com/secret" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    lookupMock
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]) // 初回ホスト
      .mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]); // リダイレクト先
    expect(
      await fetchReceiptLink("https://toasttab.com/r/A", {
        requireAllowedHost: false,
      }),
    ).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
