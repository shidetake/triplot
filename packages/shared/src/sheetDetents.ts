// ボトムシート（iOS の formSheet）の detent 計算。DB を触らない純粋関数。
//
// react-native-screens の `sheetAllowedDetents="fitToContents"` は detent が
// 1つ固定で「既定は中身にフィット、そこからもう一段小さく」ができない。
// そこで中身の高さから比率 detent を自前で組む。
//
// **比率の分母は常に iOS の `maximumDetentValue`（≒画面高 − 上部インセット。
// 検索バー等アプリ側の事情は一切考慮しない、RNS/UIKit 側の絶対値）**。
// `RNSFormSheetDetentResolver.mm` が `context.maximumDetentValue * fraction`
// で px に戻すため、比率 1.0 は常に「画面いっぱい」を意味する — 検索バーの
// 下端までに抑えたくても、分母をこちらの独自の上限にすり替えると比率 1.0 が
// 頭打ちにならず全画面まで開いてしまう（実機で確認した実バグ）。
// そのため「見せたい上限（検索バー下端など）」は分子側の `capHeight` でだけ
// 表現し、分母の `referenceHeight` とは独立させる。
// 比率は **昇順・(0,1] でないと RNS がエラーにする**ので、その保証もここで持つ。

export type SheetDetents = {
  // sheetAllowedDetents に渡す比率（昇順・(0,1]）。
  detents: number[];
  // sheetInitialDetentIndex に渡す添字。常に一番大きい detent＝開いた瞬間は
  // 既定の高さ（中身にフィット）から見せる。
  initialIndex: number;
};

// 「中身にフィット」＋「その半分」の2段を作る。
// - contentHeight: 中身の高さ（実測。px）
// - capHeight: シートに見せたい最大高さ（px）。検索バーの下端など、
//   アプリ側の都合で決める上限。中身がこれを超えるぶんは頭打ちにする。
// - referenceHeight: iOS の maximumDetentValue 相当（≒画面高 − 上部インセット。
//   px）。比率 detent の分母はここに固定する（capHeight を分母にしない）。
// - minHalfHeight: 半分の段を足す下限（これを下回るなら1段のまま）。中身が
//   元々小さい一覧をさらに縮めても取っ手だけのシートになって意味がないため。
export function fitAndHalfDetents({
  contentHeight,
  capHeight,
  referenceHeight,
  minHalfHeight,
}: {
  contentHeight: number;
  capHeight: number;
  referenceHeight: number;
  minHalfHeight: number;
}): SheetDetents {
  // 画面高が取れていない初期フレーム等の保険（0 除算・0 比率を作らない）。
  if (!(referenceHeight > 0) || !(capHeight > 0)) {
    return { detents: [1], initialIndex: 0 };
  }

  // 中身が上限を超えるぶんは capHeight で頭打ち（fitToContents と同じ発想だが
  // 上限は画面高でなくこちらが指定した値）。
  const fit = Math.min(Math.max(contentHeight, 1), capHeight);
  const detents =
    fit / 2 >= minHalfHeight
      ? [fit / 2 / referenceHeight, fit / referenceHeight]
      : [fit / referenceHeight];
  return { detents, initialIndex: detents.length - 1 };
}
