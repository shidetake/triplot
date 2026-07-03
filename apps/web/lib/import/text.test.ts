import { describe, expect, it } from "vitest";

import { htmlToText } from "./text";

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
