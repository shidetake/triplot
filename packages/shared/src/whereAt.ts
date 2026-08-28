import type { LatLng } from "./placeMap";
import { wallClockToUtcMs } from "./schedule";

// 「その日時、どこにいたか」を旅程から引く。
//
// 場所の解決（Google の検索）は地理バイアスを要求する。バイアスが無いと
// "HITEA CAFE" が京都の店になり、"セブンイレブン" がどの店か決まらない。
//
// **旅行に1つの中心を持たせるやり方では解けない。** 成田 → ホノルル →
// ハワイ島と動く旅行で、成田の空港で食べた昼食をホノルルのバイアスで引いたら
// 外れる。「どこの場所を借りるか」ではなく「**その瞬間どこにいたか**」を
// 決める必要がある。
//
// タイムゾーンの導出（resolveExpenseTz）が同じ問いを既に解いていて、移動を
// 時系列に並べて区間で決めている。ここも同じ考え方を採る。
//
// 移動1件が**端点2つ**（出発時刻に出発地／到着時刻に到着地）を生む。対象の
// 日時**以前で最も新しい端点**の場所が、そのときいた場所。
//
// **壁時計のまま並べてはいけない。** 成田 19:10 発 → ホノルル 07:25 着は
// 日付変更線を跨ぐので同じ暦日に着く。文字列のまま比べると到着が出発より
// 前に来て、順序が壊れる。移動が持っているタイムゾーン（transit だけが持つ
// 唯一の真実源）で絶対時刻に直してから並べる。
//
// 成田で 10:00 の昼食は、以前の端点が無いので**最初の端点＝成田**に落ちる
// （まだ最初の移動をしていない＝出発地にいる）。移動が1つも無ければ null を
// 返し、呼び出し側が旅行のピンの中心にフォールバックする。

export type TransitLeg = {
  // 壁時計。"YYYY-MM-DDTHH:MM"（秒以下は無くてよい）。
  departAt: string;
  arriveAt: string;
  // その壁時計のタイムゾーン（IANA）。移動だけが持つ。
  departTz: string | null;
  arriveTz: string | null;
  departPlace: LatLng | null;
  arrivePlace: LatLng | null;
};

type Endpoint = { ms: number; place: LatLng };

function toMs(wall: string, tz: string | null): number | null {
  if (!wall || !tz) return null;
  try {
    return wallClockToUtcMs(wall, tz);
  } catch {
    return null;
  }
}

export function whereAt(
  legs: TransitLeg[],
  // 対象の壁時計とそのタイムゾーン。タイムゾーンが分からなければ null を渡す
  // （旅程の最初の場所に落ちる）。
  target: { at: string; tz: string | null } | null,
): LatLng | null {
  const endpoints: Endpoint[] = [];
  for (const leg of legs) {
    const d = toMs(leg.departAt, leg.departTz);
    if (d !== null && leg.departPlace) endpoints.push({ ms: d, place: leg.departPlace });
    const a = toMs(leg.arriveAt, leg.arriveTz);
    if (a !== null && leg.arrivePlace) endpoints.push({ ms: a, place: leg.arrivePlace });
  }
  if (endpoints.length === 0) return null;
  endpoints.sort((a, b) => a.ms - b.ms);

  const targetMs = target ? toMs(target.at, target.tz) : null;
  // 日時が分からない（費用の日付が読めない・タイムゾーンが決まらない）ときは
  // 旅程の最初の場所に落とす。推測しないより、出発地にいると見なす方が近い。
  if (targetMs === null) return endpoints[0].place;

  let current: LatLng | null = null;
  for (const e of endpoints) {
    if (e.ms <= targetMs) current = e.place;
    else break;
  }
  // 以前の端点が無い＝まだ最初の移動をしていないので、出発地にいる。
  return current ?? endpoints[0].place;
}
