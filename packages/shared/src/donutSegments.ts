// 円グラフ（ドーナツ）の弧の位置を出す。web も RN も SVG の circle 1本を
// stroke-dasharray でくり抜いて1切れを描くので、その dash 長と開始位置だけを
// ここで決める＝両プラットフォームで図形が一致する。
//
// 切れ目（gapPx）は地色で分ける代わりに**弧を短くして**作る。色だけで隣り合う
// 切れ目を見分けさせないため（費用カテゴリの色はユーザーが色相を選ぶので、
// 隣り合う2色が近いことがある）。

export type DonutSegment = {
  key: string;
  /** stroke-dasharray の「描く長さ」。残りは circumference - dash。 */
  dash: number;
  /** stroke-dashoffset に渡す値（負の向き＝時計回りに進む）。 */
  offset: number;
};

export function donutSegments(
  values: { key: string; value: number }[],
  { circumference, gapPx }: { circumference: number; gapPx: number },
): DonutSegment[] {
  const positive = values.filter((v) => v.value > 0);
  const total = positive.reduce((s, v) => s + v.value, 0);
  if (total <= 0) return [];

  // 1切れしか無いなら切れ目を作らない（自分と自分の間に隙間ができてしまう）。
  const gap = positive.length > 1 ? gapPx : 0;

  const out: DonutSegment[] = [];
  let cursor = 0;
  for (const v of positive) {
    const span = (v.value / total) * circumference;
    // 細い切れも消さない。切れ目のぶんを引くと負になる場合は、切れ目と同じ
    // 長さだけ残して「そこに何かある」ことは見えるようにする。
    const dash = Math.max(span - gap, Math.min(gap, span));
    out.push({ key: v.key, dash, offset: -cursor });
    cursor += span;
  }
  return out;
}
