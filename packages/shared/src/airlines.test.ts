import { describe, expect, it } from "vitest";

import { airlineByIata, searchAirlines } from "./airlines";

describe("airlineByIata", () => {
  it("コードから引ける", () => {
    expect(airlineByIata("ZG")?.name).toBe("ZIPAIR Tokyo");
    expect(airlineByIata("JL")?.name).toBe("日本航空");
    expect(airlineByIata("NH")?.name).toBe("全日本空輸");
  });

  it("小文字・空白を吸収する", () => {
    expect(airlineByIata(" jl ")?.iata).toBe("JL");
  });

  it("同じコードを持つ子会社ではなく親会社を返す（知名度で解決）", () => {
    // QF は Qantas Airways。運航子会社の Eastern Australia Airlines ではない
    expect(airlineByIata("QF")?.englishName).toBe("Qantas Airways");
  });

  it("無いコードは null", () => {
    expect(airlineByIata("XQ9")).toBeNull();
    expect(airlineByIata("")).toBeNull();
  });
});

describe("searchAirlines", () => {
  it("英語名で引ける", () => {
    expect(searchAirlines("zipair")[0].iata).toBe("ZG");
    expect(searchAirlines("qantas")[0].iata).toBe("QF");
  });

  it("日本語名で引ける", () => {
    expect(searchAirlines("日本航空")[0].iata).toBe("JL");
    expect(searchAirlines("スカイマーク")[0].iata).toBe("BC");
  });

  it("途中まででも引ける", () => {
    expect(searchAirlines("zip")[0].iata).toBe("ZG");
    expect(searchAirlines("ぜ").length).toBeGreaterThanOrEqual(0); // 落ちないこと
  });

  it("コード一致が最優先", () => {
    // "NH" は全日空のコード。名前に nh を含む他社より先に出る
    expect(searchAirlines("nh")[0].iata).toBe("NH");
  });

  it("曖昧な語では知名度順になる（無名社が先に出ない）", () => {
    const top = searchAirlines("air", 5).map((a) => a.iata);
    // 上位に大手が来ること（並びの詳細ではなく「無名だらけにならない」を担保）
    expect(top).toContain("AF");
  });

  it("語の頭でも引ける", () => {
    expect(searchAirlines("nippon").some((a) => a.iata === "NH")).toBe(true);
  });

  it("空文字は空", () => {
    expect(searchAirlines("")).toEqual([]);
    expect(searchAirlines("   ")).toEqual([]);
  });

  it("件数を絞れる", () => {
    expect(searchAirlines("a", 3).length).toBeLessThanOrEqual(3);
  });
});
