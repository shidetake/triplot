import { describe, expect, it } from "vitest";

import { buildImportAddress, parseImportToken } from "./inboundAddress";

describe("buildImportAddress", () => {
  it("token から取り込みアドレスを作る", () => {
    expect(buildImportAddress("abc123")).toBe("receipts+abc123@triplot.app");
  });
});

describe("parseImportToken", () => {
  it("素のアドレスから token を取る", () => {
    expect(parseImportToken("receipts+abc123@triplot.app")).toBe("abc123");
  });
  it("<...> や表示名付きでも取れる", () => {
    expect(parseImportToken("<receipts+abc123@triplot.app>")).toBe("abc123");
    expect(parseImportToken("triplot <receipts+abc123@triplot.app>")).toBe(
      "abc123",
    );
  });
  it("大文字混じりの宛先でも小文字化して取る", () => {
    expect(parseImportToken("Receipts+ABC123@Triplot.App")).toBe("abc123");
  });
  it("token 無し / 別ローカルパート / 不正は null", () => {
    expect(parseImportToken("receipts@triplot.app")).toBeNull();
    expect(parseImportToken("hello+abc@triplot.app")).toBeNull();
    expect(parseImportToken("receipts+@triplot.app")).toBeNull();
    expect(parseImportToken("not-an-email")).toBeNull();
  });
});
