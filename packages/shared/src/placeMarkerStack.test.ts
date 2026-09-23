import { describe, expect, it } from "vitest";

import { markerStackRanks, type StackablePlace } from "./placeMarkerStack";

const p = (
  id: string,
  lat: number | null,
  tentative = false,
): StackablePlace => ({ id, lat, tentative });

// 奥 → 手前の並びに直す（テストが読みやすいように）。
function order(places: StackablePlace[]): string[] {
  const ranks = markerStackRanks(places);
  return [...places]
    .sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!)
    .map((x) => x.id);
}

describe("地図ピンの重なり順", () => {
  it("未確定は緯度に関わらず確定より奥", () => {
    // 緯度だけで並べれば南の候補(a)が最前面に来てしまう組み合わせ。
    expect(
      order([p("a", 10, true), p("b", 50), p("c", 60, true), p("d", 20)]),
    ).toEqual(["c", "a", "b", "d"]);
  });

  it("同じ段の中は緯度が低い（南）ほど手前", () => {
    expect(order([p("n", 60), p("s", 10), p("m", 35)])).toEqual(["n", "m", "s"]);
  });

  it("南半球でも同じ（緯度の符号で切り替わらない）", () => {
    expect(order([p("n", 10), p("s", -40), p("m", -10)])).toEqual([
      "n",
      "m",
      "s",
    ]);
  });

  it("座標が完全一致したら id 昇順で必ず同じ側が勝つ", () => {
    const same = [p("zz", 21.27), p("aa", 21.27)];
    expect(order(same)).toEqual(["aa", "zz"]);
    // 入力の並びが変わっても結果は変わらない（描画のたびに入れ替わらない）。
    expect(order([...same].reverse())).toEqual(["aa", "zz"]);
  });

  it("順位は 0 から始まる連番（隙間なく整数で振る）", () => {
    const ranks = markerStackRanks([p("a", 1), p("b", 2, true), p("c", 3)]);
    expect([...ranks.values()].sort((x, y) => x - y)).toEqual([0, 1, 2]);
  });

  it("座標を持たない場所は最奥（地図に出ないので順位を消費するだけ）", () => {
    expect(order([p("hasPin", 35), p("noPin", null)])).toEqual([
      "noPin",
      "hasPin",
    ]);
  });
});
