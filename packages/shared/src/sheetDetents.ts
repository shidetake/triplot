// ボトムシート（iOS の formSheet）の detent 計算。DB を触らない純粋関数。
//
// react-native-screens の `sheetAllowedDetents="fitToContents"` は detent が
// 1つ固定で「既定は中身にフィット、そこからもう一段小さく」ができない。
// そこで中身の高さから比率 detent を自前で組む。比率は iOS の
// maximumDetentValue（シートが取れる最大高さ）に対する割合で、
// **昇順・(0,1] でないと RNS がエラーにする**ので、その保証もここで持つ。

export type SheetDetents = {
  // sheetAllowedDetents に渡す比率（昇順・(0,1]）。
  detents: number[];
  // sheetInitialDetentIndex に渡す添字。常に一番大きい detent＝開いた瞬間は
  // 既定の高さ（中身にフィット）から見せる。
  initialIndex: number;
};

// 「中身にフィット」＋「その半分」の2段を作る。
// - contentHeight: 中身の高さ（実測。px）
// - maxSheetHeight: シートが取れる最大高さ（≒画面高 − 上部インセット。px）
// - minHalfHeight: 半分の段を足す下限（これを下回るなら1段のまま）。中身が
//   元々小さい一覧をさらに縮めても取っ手だけのシートになって意味がないため。
export function fitAndHalfDetents({
  contentHeight,
  maxSheetHeight,
  minHalfHeight,
}: {
  contentHeight: number;
  maxSheetHeight: number;
  minHalfHeight: number;
}): SheetDetents {
  // 画面高が取れていない初期フレーム等の保険（0 除算・0 比率を作らない）。
  if (!(maxSheetHeight > 0)) return { detents: [1], initialIndex: 0 };

  // 中身が最大高さを超えるぶんはシートの上限で頭打ち（fitToContents と同じ）。
  const fit = Math.min(Math.max(contentHeight, 1), maxSheetHeight);
  const detents =
    fit / 2 >= minHalfHeight
      ? [fit / 2 / maxSheetHeight, fit / maxSheetHeight]
      : [fit / maxSheetHeight];
  return { detents, initialIndex: detents.length - 1 };
}
