import { describe, expect, it } from "vitest";

import { toHalfWidth } from "./normalize";

describe("toHalfWidth", () => {
  it("全角英字・記号・スペースを半角にして連続スペースを詰める", () => {
    expect(toHalfWidth("ＵＢＥＲ　　　＊ＴＲＩＰ")).toBe("UBER *TRIP");
  });
  it("全角数字を半角に", () => {
    expect(toHalfWidth("８９９４０２")).toBe("899402");
  });
  it("日本語はそのまま", () => {
    expect(toHalfWidth("飲食")).toBe("飲食");
  });
  it("カタカナは半角にしない", () => {
    expect(toHalfWidth("ソニー銀行")).toBe("ソニー銀行");
  });
  it("混在もOK", () => {
    expect(toHalfWidth("ＫＡＩ ＣＯＦＦＥＥ 浅草")).toBe("KAI COFFEE 浅草");
  });
});
