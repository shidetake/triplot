import { describe, expect, it } from "vitest";
import { resolveFlightNumber, parseFlightNumber } from "./flight";

describe("resolveFlightNumber", () => {
  it("IATA 形はそのまま", () => {
    expect(resolveFlightNumber("DL181")?.normalized).toBe("DL181");
    expect(resolveFlightNumber("ZG 002")?.normalized).toBe("ZG002");
  });
  it("航空会社名 + 便番号を読める（実データの揺らぎ）", () => {
    expect(resolveFlightNumber("DELTA 181")?.normalized).toBe("DL181");
    expect(resolveFlightNumber("Delta 181")?.normalized).toBe("DL181");
  });
  it("曖昧・不明な名前は諦める（誤った便を引かない）", () => {
    expect(resolveFlightNumber("AIR 181")).toBeNull();
    expect(resolveFlightNumber("のぞみ23号")).toBeNull();
  });
  it("手入力用の parseFlightNumber は従来どおり弾く", () => {
    expect(parseFlightNumber("DELTA 181")).toBeNull();
  });
});
