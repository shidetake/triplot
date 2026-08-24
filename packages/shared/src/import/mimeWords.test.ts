import { describe, expect, it } from "vitest";

import { decodeMimeWords } from "./mimeWords";

describe("decodeMimeWords", () => {
  it("実際に受信箱に出てしまった件名を解く", () => {
    expect(
      decodeMimeWords("=?UTF-8?Q?Fwd=3A_Thanks_for_your_purchase!?="),
    ).toBe("Fwd: Thanks for your purchase!");
  });

  it("B（base64）も解く", () => {
    expect(decodeMimeWords("=?UTF-8?B?44GT44KT44Gr44Gh44Gv?=")).toBe(
      "こんにちは",
    );
  });

  it("encoded-word 同士の間の空白は落とす（区切りであって中身ではない）", () => {
    expect(
      decodeMimeWords("=?UTF-8?B?44GT44KT?= =?UTF-8?B?44Gr44Gh44Gv?="),
    ).toBe("こんにちは");
  });

  it("素の文字列・前後の地の文はそのまま", () => {
    expect(decodeMimeWords("Fwd: Your Receipt")).toBe("Fwd: Your Receipt");
    expect(decodeMimeWords("Re: =?UTF-8?Q?=E4=BA=88=E7=B4=84?= の件")).toBe(
      "Re: 予約 の件",
    );
  });

  it("null と空はそのまま", () => {
    expect(decodeMimeWords(null)).toBeNull();
    expect(decodeMimeWords("")).toBe("");
  });

  it("解けないものは消さずに元のまま残す（件名が空になる方が困る）", () => {
    const broken = "=?NOSUCH-CHARSET?Q?abc?=";
    expect(decodeMimeWords(broken)).toBe(broken);
  });

  it("ISO-8859-1 のような別の charset も解く", () => {
    expect(decodeMimeWords("=?ISO-8859-1?Q?caf=E9?=")).toBe("café");
  });
});
