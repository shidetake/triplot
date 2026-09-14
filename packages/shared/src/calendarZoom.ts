// 週カレンダーの縦ピンチ（時間の縮尺）の計算。使うのは RN の週カレンダーだけ
// だが、純粋な計算なのでここに置いてテストする（画面側に残るのはジェスチャーの
// 配線だけになる）。

// 一番寄せた時に画面へ入れる時間数。**px ではなく「何時間見えるか」で決める** —
// px で上限を持つと端末の高さによって見える範囲が変わる。
export const ZOOM_MAX_VISIBLE_HOURS = 6;

// 一番縮めた時の1時間の高さ（px）。縮尺の下限で、既定の表示でもある。
export const HOUR_PX_MIN = 30;

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
  // 24時の下に足してある余白（タブバーに隠れないぶん）。中身の高さに含まれる
  // ので、これを入れないと下端付近で実際より手前に切り詰めてしまう。
  contentPaddingBottom?: number;
}): number {
  const contentH = 24 * a.hourPx + (a.contentPaddingBottom ?? 0);
  const maxScroll = Math.max(0, contentH - a.viewportH);
  const y = (a.focalMin / 60) * a.hourPx - a.focalY;
  return Math.max(0, Math.min(maxScroll, y));
}

// 予定ブロックの**見た目の最低の高さ（px）**。短い予定でも見出しが読める高さを
// 確保するためのもので、schedule.ts はこれを分に直した値で重なりを判定する。
//
// 値は既定の縮尺（1時間30px）で30分ぶん＝15px。ここを起点に、拡大したら必要な
// 分数は小さくなる（下の minEventMinutes）。
export const MIN_EVENT_PX = 15;

// 今の縮尺で、最低の高さが何分に相当するか。
//
// **最低の高さはピクセルの話なので、縮尺で変わる。** 分で固定すると、拡大して
// 実際には隙間が空いている2つの予定が「重なっている」と判定され続け、2列に
// 分かれたままになる（実機フィードバック）。1時間が90pxまで拡大されていれば、
// 15px は10分ぶんでしかない。
export function minEventMinutes(hourPx: number): number {
  if (hourPx <= 0) return 30;
  return Math.max(1, Math.round((MIN_EVENT_PX / hourPx) * 60));
}

// ドラッグで時刻を置く時の刻み（分）。**拡大したぶんだけ細かく置ける。**
//
// 刻みを分で固定すると、拡大するほど1刻みが遠くなる（90px/h まで寄せると
// 30分の刻みは 45px 先）。細かく置きたくて拡大したのに粗く感じる、という
// ことになる。2列判定（上の minEventMinutes）と同じで、**本当に決まって
// いるのは px の側**なので、今の縮尺で分に直す。
//
// 1つだけ minEventMinutes と違うところがある。あちらは内部の比較なので
// 何分でも構わないが、こちらは**人が読む時刻になる**（9:07 開始の予定を
// 作ってしまう）。なので px から出した値を時計の目盛りに丸める。

// 指1本で狙える1刻みの幅（px）。これより細かくすると、指の震えで値が変わる。
// **根拠は今の手触りそのもの** — 一番縮めた状態（1時間30px）では 30分が
// ちょうど 15px で、今そう動いている。
export const SNAP_PX_MIN = 15;

// 時計の目盛り（粗い順）。どれも60を割り切るので、刻み続けても :00 に戻る。
const SNAP_LADDER = [30, 15, 10, 5] as const;

export function snapMinutes(hourPx: number): number {
  // 15px 以上の高さを持つ一番細かい目盛り。どれも届かない（縮めすぎ・
  // 未計測）なら一番粗いもの。
  let step: number = SNAP_LADDER[0];
  for (const s of SNAP_LADDER) {
    if ((s / 60) * hourPx >= SNAP_PX_MIN) step = s;
  }
  return step;
}
