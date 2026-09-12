import { describe, expect, it } from "vitest";

import { htmlToText, trimLongUrls } from "./text";

describe("htmlToText", () => {
  it("タグを除去してテキストにする", () => {
    expect(htmlToText("<p>Total <b>$14.40</b></p>")).toBe("Total $14.40");
  });

  it("script / style の中身を落とす", () => {
    const html = "<style>.x{color:red}</style><div>KAI COFFEE</div>";
    expect(htmlToText(html)).toBe("KAI COFFEE");
  });

  it("ブロック境界と <br> で改行する", () => {
    expect(htmlToText("<div>A</div><div>B</div>")).toBe("A\nB");
    expect(htmlToText("A<br>B")).toBe("A\nB");
  });

  it("HTML エンティティを戻す", () => {
    expect(htmlToText("Ben &amp; Jerry&#39;s")).toBe("Ben & Jerry's");
    expect(htmlToText("a&nbsp;b")).toBe("a b");
  });

  it("連続する空白・改行を圧縮する", () => {
    expect(htmlToText("<div>A</div>\n\n\n<div>B</div>")).toBe("A\n\nB");
    expect(htmlToText("x      y")).toBe("x y");
  });
});

// 本文の 60% が URL で、その大半が追跡用の長いクエリだった（実測・本番100通）。
// プロンプトでも「トラッキングURLは無視する」と言っているので、無視させるために
// トークンを払っていたことになる。**消さずに削る** —— detailUrl の照合と
// 配信停止リンクの判定はホストとパスの頭で決まるので、先頭を残せば変わらない。
describe("trimLongUrls", () => {
  const long = `https://r.example.com/track/${"a".repeat(300)}`;

  it("長い URL は先頭だけ残して末尾を落とす", () => {
    const out = trimLongUrls(`明細はこちら ${long} 以上`);
    expect(out).toContain("https://r.example.com/track/");
    expect(out).toContain("…");
    expect(out.length).toBeLessThan(`明細はこちら ${long} 以上`.length);
    // 前後の本文は触らない。
    expect(out.startsWith("明細はこちら ")).toBe(true);
    expect(out.endsWith(" 以上")).toBe(true);
  });

  it("短い URL はそのまま残す（レシートのリンクを壊さない）", () => {
    const short = "https://order.toasttab.com/receipt/abc123";
    expect(trimLongUrls(`領収書 ${short}`)).toBe(`領収書 ${short}`);
  });

  it("ホストとパスの頭は残る（許可ホストの判定が変わらない）", () => {
    const out = trimLongUrls(long);
    expect(new URL(out.replace("…", "")).hostname).toBe("r.example.com");
  });

  it("URL が無い本文は変わらない", () => {
    expect(trimLongUrls("合計 $14.40")).toBe("合計 $14.40");
  });

  it("複数の URL をそれぞれ削る", () => {
    const out = trimLongUrls(`${long} と ${long}`);
    expect(out.match(/…/g)).toHaveLength(2);
  });
});

