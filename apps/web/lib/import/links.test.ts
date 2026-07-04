import { describe, expect, it } from "vitest";

import { isBlockedIp } from "./ssrf";
import {
  extractUrls,
  isAllowedReceiptHost,
  isLikelyUnsubscribeUrl,
  isUnknownReceiptHostUrl,
  selectReceiptLinks,
} from "./links";

describe("extractUrls", () => {
  it("本文中の URL を拾い重複を除く", () => {
    const t = "see https://a.com/x and https://a.com/x or http://b.org";
    expect(extractUrls(t)).toEqual(["https://a.com/x", "http://b.org"]);
  });
  it("末尾の句読点を落とす", () => {
    expect(extractUrls("go to https://a.com/r/abc.")).toEqual([
      "https://a.com/r/abc",
    ]);
  });
});

describe("isAllowedReceiptHost", () => {
  it("許可ドメインとそのサブドメインを通す", () => {
    expect(isAllowedReceiptHost("squareup.com")).toBe(true);
    expect(isAllowedReceiptHost("checkout.squareup.com")).toBe(true);
    expect(isAllowedReceiptHost("clover.com")).toBe(true);
  });
  it("無関係/偽装ドメインを弾く", () => {
    expect(isAllowedReceiptHost("evil.com")).toBe(false);
    expect(isAllowedReceiptHost("squareup.com.evil.com")).toBe(false);
    expect(isAllowedReceiptHost("notsquareup.com")).toBe(false);
  });
});

describe("selectReceiptLinks", () => {
  it("許可ドメインのリンクだけ返す", () => {
    const t =
      "receipt https://squareup.com/r/ABC tracking https://ct.sendgrid.net/x";
    expect(selectReceiptLinks(t)).toEqual(["https://squareup.com/r/ABC"]);
  });
});

describe("isUnknownReceiptHostUrl", () => {
  it("未許可ホストの https URL だけ第2パス対象", () => {
    expect(isUnknownReceiptHostUrl("https://toasttab.com/r/ABC")).toBe(true);
  });
  it("許可ホスト（サブドメイン含む）は第1パスで取得済みなので対象外", () => {
    expect(isUnknownReceiptHostUrl("https://squareup.com/r/ABC")).toBe(false);
    expect(isUnknownReceiptHostUrl("https://checkout.squareup.com/r/A")).toBe(
      false,
    );
  });
  it("https 以外・不正 URL は対象外", () => {
    expect(isUnknownReceiptHostUrl("http://toasttab.com/r/ABC")).toBe(false);
    expect(isUnknownReceiptHostUrl("not a url")).toBe(false);
  });
});

describe("isLikelyUnsubscribeUrl", () => {
  it("代表的な配信解除キーワードを path/query どちらでも検知する", () => {
    expect(
      isLikelyUnsubscribeUrl("https://esp.example.com/unsubscribe/abc123"),
    ).toBe(true);
    expect(
      isLikelyUnsubscribeUrl("https://esp.example.com/e/click?u=1&unsub=1"),
    ).toBe(true);
    expect(
      isLikelyUnsubscribeUrl("https://esp.example.com/opt-out?id=1"),
    ).toBe(true);
    expect(
      isLikelyUnsubscribeUrl(
        "https://esp.example.com/email-preferences/manage",
      ),
    ).toBe(true);
    expect(
      isLikelyUnsubscribeUrl("https://esp.example.com/DoNotEmail?id=1"),
    ).toBe(true); // 大小文字を無視
  });
  it("無関係な明細リンクは検知しない", () => {
    expect(isLikelyUnsubscribeUrl("https://toasttab.com/r/ABC123")).toBe(
      false,
    );
  });
  it("不正 URL は false", () => {
    expect(isLikelyUnsubscribeUrl("not a url")).toBe(false);
  });
});

describe("isBlockedIp", () => {
  it("内部向け IP を弾く", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:192.168.0.1",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });
  it("公開 IP は通す", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
});
