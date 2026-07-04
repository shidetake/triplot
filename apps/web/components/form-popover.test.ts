import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// NarrowSheet（狭い画面のボトムシート）は DOM 描画を伴わないと検証できないため、実際の
// レンダリング/vaul の挙動はこの vitest では検知できない。過去に一度、Content の高さを
// CSS の dvh（ソフトキーボードの開閉には反応しない仕様）から window.visualViewport の実測値
// （ソフトキーボードの開閉でも resize が発火する）に置き換えてしまい、repositionInputs={false}
// で意図的に無効化していた「キーボード開閉のたびに sheet がズレる」不具合を再発させたことがある。
// 同じ間違いを機械的に検知するための静的ガード（ソースをテキストとして読み、意図した実装
// パターンが残っているかを正規表現で確認する）。
const source = readFileSync(
  path.join(__dirname, "form-popover.tsx"),
  "utf-8",
);

describe("NarrowSheet（ソースの静的ガード）", () => {
  it("repositionInputs を明示的に無効化している（vaul のキーボード追従を使わない）", () => {
    expect(source).toMatch(/repositionInputs=\{false\}/);
  });

  it("Content の高さは CSS の dvh 単位で決める（visualViewport の実測値を使わない）", () => {
    expect(source).toMatch(/height:\s*`\$\{SHEET_MAX_PERCENT\}dvh`/);
    // コメントでの言及（なぜ使わないかの説明）は許すが、実装での使用（window.visualViewport /
    // vv.addEventListener 等）は禁止する。
    expect(source).not.toMatch(/window\.visualViewport/);
  });
});
