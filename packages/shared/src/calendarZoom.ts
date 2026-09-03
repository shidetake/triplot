// 週カレンダーの縦ピンチ（時間の縮尺）の計算。使うのは RN の週カレンダーだけ
// だが、純粋な計算なのでここに置いてテストする（画面側に残るのはジェスチャーの
// 配線だけになる）。

// 一番寄せた時に画面へ入れる時間数。**px ではなく「何時間見えるか」で決める** —
// px で上限を持つと端末の高さによって見える範囲が変わる。
export const ZOOM_MAX_VISIBLE_HOURS = 6;

// 画面の高さから、1時間の高さの上限を導く。まだ測れていない（0）ときは
// 既定の3倍を仮に使う（iPhone 16 Pro の実測がおよそこの倍率）。
export function maxHourPx(viewportH: number, minHourPx: number): number {
  if (viewportH <= 0) return minHourPx * 3;
  return Math.max(minHourPx, viewportH / ZOOM_MAX_VISIBLE_HOURS);
}

// ピンチ中の1時間の高さ。倍率はピンチ開始時の値に掛ける（前回の値に掛けると
// 指を動かすたびに二重に効いて発散する）。
export function zoomedHourPx(
  startHourPx: number,
  scale: number,
  minHourPx: number,
  max: number,
): number {
  return Math.min(max, Math.max(minHourPx, startHourPx * scale));
}

// **指の間にある時刻を動かさない**スクロール位置。拡大すると見ていた時間帯が
// 画面外へ流れていくので、焦点の時刻が同じ高さに残るよう寄せ直す。
export function zoomAnchoredScrollY(a: {
  // 焦点の時刻（0時からの分）。ピンチ開始時に求めた値を使い回す。
  focalMin: number;
  // 焦点のビューポート内の高さ（上端から）。
  focalY: number;
  // 拡大後の1時間の高さ。
  hourPx: number;
  viewportH: number;
}): number {
  const maxScroll = Math.max(0, 24 * a.hourPx - a.viewportH);
  const y = (a.focalMin / 60) * a.hourPx - a.focalY;
  return Math.max(0, Math.min(maxScroll, y));
}

// ビューポート内の高さ → 0時からの分。ピンチ開始時に焦点の時刻を求めるのに使う。
export function minutesAt(scrollY: number, viewportY: number, hourPx: number) {
  return ((scrollY + viewportY) / hourPx) * 60;
}
