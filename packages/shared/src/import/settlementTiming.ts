// 銀行・カード会社の決済通知に書かれた日付を、**買った土地の壁時計**に直す
// （純関数・後処理）。
//
// 通知に書かれているのは発行元の国の暦の日付で、しかも時刻が無いことが多い
// （ソニー銀行の「カード利用日：2026年4月29日」）。海外で使うと現地の日付と
// ずれる — 実データでは、ハワイでの支払いが軒並み日本時間の翌日として取り込まれ、
// 旅程の1日後ろに並んでいた。
//
// 直すには絶対時刻が要る。手がかりは2つで、上から順に使う:
//
//   1. 本文に日付と時刻の両方がある → 発行元のタイムゾーンで読めばそれが瞬間。
//   2. 日付しか無い → **通知メールの送信時刻**を瞬間として使う。利用のたびに
//      送ってくる通知はほぼ即時に届く（実測: 8通すべて、送信時刻を発行元の
//      タイムゾーンで読んだ日付が本文の利用日と一致した）。
//
// 2 は推測なので、必ず**本文の利用日と突き合わせる**。発行元の暦で見た送信日が
// 利用日と違うなら「即時ではない」＝この通知の送信時刻はその買い物の時刻を
// 表していないので、送信時刻は捨てて本文の利用日をそのまま残す（利用日の方が
// 確実に正しい）。後日まとめて届く「ご利用金額確定のお知らせ」や、何か月も
// 経ってから転送されたメールはここで落ちる。
//
// **店のレシートには一切触らない**（dateIsSettlement=false）。店が刷る日時は
// 最初からその土地の壁時計なので、直す対象が無い。

import {
  tzAtInstant,
  utcMsToWallClock,
  wallClockToUtcMs,
  type TripTzTimeline,
} from "../schedule";

export type SettlementTiming = {
  date: string;
  time: string | null;
  dateIsSettlement: boolean;
  // 通知の日付が書かれている暦のタイムゾーン（発行元の国）。抽出時に LLM が
  // 発行元・言語から答える。分からなければ null＝直さない。
  settlementTz?: string | null;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 直せるなら直した壁時計を、直す必要が無い／根拠が足りないなら null を返す。
 *
 * `placeTz` はその支払いをした場所のタイムゾーン（解決済みの場所の座標から引く）。
 * 場所が分からないなら「どこの現地時間に直すのか」が決まらないので直さない。
 */
export function localizeSettlementTiming(
  r: SettlementTiming,
  ctx: { sentAt: string | null; placeTz: string | null },
): { date: string; time: string | null } | null {
  const srcTz = r.settlementTz ?? null;
  if (!r.dateIsSettlement || !srcTz || !ctx.placeTz) return null;

  const wall =
    YMD_RE.test(r.date) && r.time
      ? utcMsToWallClock(
          wallClockToUtcMs(`${r.date}T${r.time}`, srcTz),
          ctx.placeTz,
        )
      : localizeBySendTime(r.date, srcTz, ctx);
  if (!wall) return null;

  const fixed = { date: wall.slice(0, 10), time: wall.slice(11, 16) };
  return fixed.date === r.date && fixed.time === r.time ? null : fixed;
}

function localizeBySendTime(
  date: string,
  srcTz: string,
  ctx: { sentAt: string | null; placeTz: string | null },
): string | null {
  const ms = ctx.sentAt ? Date.parse(ctx.sentAt) : NaN;
  if (!Number.isFinite(ms) || !ctx.placeTz) return null;
  // 発行元の暦で見た送信日が利用日と違う＝即時の通知ではない。
  if (YMD_RE.test(date) && utcMsToWallClock(ms, srcTz).slice(0, 10) !== date) {
    return null;
  }
  return utcMsToWallClock(ms, ctx.placeTz);
}

/**
 * 場所の座標が分からない時の控え: **旅行の旅程**を土地の代わりにする。
 *
 * 上の localizeSettlementTiming は「どの土地の壁時計に直すか」を、解決できた
 * 場所の座標からしか取れない。カードの明細表記（"WHOLEFDS QUE#10615"）は
 * 店の名前として引けないので土地が決まらず、日付が発行元の暦のまま残る
 * ——実データで、ホノルルでの買い物が日本時間の翌日に置かれていた。
 *
 * 旅行が「その瞬間どこに居たか」を知っているなら、それが土地の答えになる。
 * 移動の予定は両端に実タイムゾーンを持つので、瞬間さえあれば移動日でも
 * 決まる（tzAtInstant）。旅程に移動が1本も無ければ答えは出ない＝直さない。
 *
 * **これは読み出しのたびに走る。** 旅程は後から変わるので、取り込み時の値に
 * 焼き込むと古くなる（通常の予定の実効タイムゾーンを保存しないのと同じ理由。
 * docs/design/timezone.md の 0 節）。
 */
export function localizeSettlementByTrip(
  r: SettlementTiming & { sentAt?: string | null },
  timeline: TripTzTimeline,
): { date: string; time: string | null } | null {
  const srcTz = r.settlementTz ?? null;
  if (!r.dateIsSettlement || !srcTz) return null;
  // 直す前の瞬間。本文に時刻があれば発行元の暦で読み、無ければ通知の送信時刻。
  // どちらを使ったかに関わらず、その瞬間で居場所を引く。
  const ms =
    YMD_RE.test(r.date) && r.time
      ? wallClockToUtcMs(`${r.date}T${r.time}`, srcTz)
      : r.sentAt
        ? Date.parse(r.sentAt)
        : NaN;
  const tripTz = tzAtInstant(timeline, ms);
  if (!tripTz) return null;
  // 即時性の判定（本文の利用日と送信日の突き合わせ）は本体に任せる。後日届く
  // 「ご利用金額確定のお知らせ」はそこで落ちる。
  return localizeSettlementTiming(r, {
    sentAt: r.sentAt ?? null,
    placeTz: tripTz,
  });
}
