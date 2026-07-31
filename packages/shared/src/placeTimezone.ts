// 場所（緯度経度）から IANA タイムゾーンを引く。DB を触らない純粋関数。
//
// 移動の予定で「出発地のTZ」「到着地のTZ」をユーザーに3段ネストのリストから
// 選ばせるのは重い。場所を選んだ時点でその土地のローカル時間は決まっているので、
// 座標から導出して既定値にする（ユーザーは確認するだけ。上書きは可能）。
//
// **places に TZ 列は持たせない。** ピンはドラッグで動かせるので、保存すると
// 座標が変わるたびに更新が要る＝陳腐化する。座標から都度引けばズレようがない。
//
// オンラインの API（Google Time Zone API 等）ではなくオフラインのテーブルを
// 使うのは、入力中に即座に出したいのと、呼び出し課金を避けるため。

import tzLookup from "@photostructure/tz-lookup";

export type PlaceCoords = { lat: number | null; lng: number | null };

/**
 * 場所の IANA タイムゾーン。座標が無い場所（自由入力で作った「地図未登録」の
 * 場所など）は決められないので null を返す＝呼び出し側で TZ を聞く。
 */
export function timezoneOfPlace(place: PlaceCoords | null | undefined): string | null {
  if (!place || place.lat == null || place.lng == null) return null;
  try {
    return tzLookup(place.lat, place.lng);
  } catch {
    // 範囲外の座標などライブラリが投げるケース。聞く側に倒す。
    return null;
  }
}

/**
 * 移動の予定の出発TZ・到着TZを場所から導出する。
 *
 * 片方しか決められないこともある（到着地だけ自由入力で座標が無い等）ので、
 * 決まらない側は null で返し、UI 側でそこだけ聞く。
 */
export function deriveTransitTimezones(
  startPlace: PlaceCoords | null | undefined,
  endPlace: PlaceCoords | null | undefined,
): { startTz: string | null; endTz: string | null } {
  return {
    startTz: timezoneOfPlace(startPlace),
    endTz: timezoneOfPlace(endPlace ?? startPlace),
  };
}

/**
 * 出発地と到着地で実際にタイムゾーンが変わるか。
 *
 * 予定を `kind='transit'`（旅行のTZ境界）として保存するかの判定に使う。
 * ユーザーが「移動」と言っても、東京→大阪のように時差が無ければ境界を作る
 * 意味がないので通常の予定として保存する（無意味な境界を旅程に増やさない）。
 * どちらかのTZが決められないときは境界にしない（false）。
 */
export function crossesTimezone(
  startTz: string | null,
  endTz: string | null,
): boolean {
  if (!startTz || !endTz) return false;
  return startTz !== endTz;
}
