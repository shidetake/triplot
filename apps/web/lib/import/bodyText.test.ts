import { describe, expect, it } from "vitest";

import { htmlToText, pickBodyText } from "./text";

describe("htmlToText がリンクの URL を残す", () => {
  it("文字と URL を並べて残す", () => {
    expect(
      htmlToText('<a href="https://ex.com/r/1">レシートを見る</a>'),
    ).toContain("レシートを見る (https://ex.com/r/1)");
  });

  it("文字が無いリンクは URL だけ残す", () => {
    expect(htmlToText('<a href="https://ex.com/x"><img src="a.png"></a>')).toBe(
      "https://ex.com/x",
    );
  });

  it("文字がその URL 自身なら二度書かない", () => {
    expect(htmlToText('<a href="https://ex.com/x">https://ex.com/x</a>')).toBe(
      "https://ex.com/x",
    );
  });

  it("配信停止のリンクも文字と URL が残る（判断材料になる）", () => {
    const t = htmlToText('<a href="https://m.example/u/abc">配信停止</a>');
    expect(t).toBe("配信停止 (https://m.example/u/abc)");
  });
});

describe("pickBodyText", () => {
  it("片方しか無ければそれを使う", () => {
    expect(pickBodyText("", "html です")).toBe("html です");
    expect(pickBodyText("plain です", "")).toBe("plain です");
  });

  it("両方あるならプレーンテキスト（短くて安い・URL も入っている）", () => {
    const plain = "x".repeat(400);
    const html = "y".repeat(900);
    expect(pickBodyText(plain, html)).toBe(plain);
  });

  // 実際に起きた形: 元が HTML だけのメールを転送すると、プレーン側が
  // 転送ヘッダーだけ（217文字）になり、中身は HTML 側にしか無い。
  it("プレーンが張りぼてなら HTML を使う", () => {
    const stub = "x".repeat(217);
    const html = "y".repeat(7800);
    expect(pickBodyText(stub, html)).toBe(html);
  });

  it("実測の下限（比 0.32）はプレーンのまま", () => {
    const plain = "x".repeat(327);
    const html = "y".repeat(1031);
    expect(pickBodyText(plain, html)).toBe(plain);
  });
});
