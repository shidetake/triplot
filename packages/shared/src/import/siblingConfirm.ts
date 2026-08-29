// 同じメールから出た下書きの連動確定。
//
// 1通のメールはたいてい「費用1件＋予定1件」を産む（同じ来店の別の見え方）。
// 本番の取り込み52通のうち44通がこの組だった。片方だけ確定すると相方が
// 未確定のまま残り続けるので、**費用か予定のどちらかを確定したら、同じ
// メールの残りも確定する**。
//
// 「確定」はフラグを立てることではなく実際に費用/予定を作ることなので、
// ここは下書きの事前入力（drafts.ts）を createExpense/createEvent の
// フィールドに写す純関数を持つ。値はフォームを開いた時の初期値と同じ＝
// ユーザーが何も触らずに保存したのと同じ結果になる。
//
// 場所の確定はこの連動とは独立。費用でも予定でも、確定すればその中で
// 場所が作られる（PlaceInput 経由）。逆に場所だけを確定しても費用・予定は
// 確定しない。

import type { EventFields } from "../data/events";
import type { ExpenseFields } from "../data/expenses";
import type { PlaceInput } from "../data/place";
import { rateTo } from "../fxRates";
import type { Currency } from "../types/database";

import {
  draftEventTimes,
  type DraftAutoResolvePlace,
  type EventDraftItem,
  type EventDraftPlacePrefill,
  type ExpenseDraftItem,
} from "./drafts";

// 下書きの場所の事前入力 → 保存時の場所指定。フォームが場所欄に出している
// ものをそのまま渡す。事前解決できていない（null）ときは、フォームが
// 自由入力欄に置いているテキストと同じものを自由入力として渡す
// （web はフォームを開くと Google 自動解決を試みるが、開かずに作る経路では
// テキストのままにする＝勝手に別の店に紐づけない）。
export function placeInputFromDraft(
  place: EventDraftPlacePrefill,
  autoResolve: DraftAutoResolvePlace,
): PlaceInput {
  if (place?.kind === "saved") return { kind: "saved", placeId: place.id };
  if (place?.kind === "google")
    return {
      kind: "google",
      placeId: place.placeId,
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      region: place.region,
      locality: place.locality,
      icon: place.icon ?? undefined,
    };
  if (place?.kind === "free")
    return {
      kind: "free",
      label: place.name,
      coords:
        place.lat !== null && place.lng !== null
          ? { lat: place.lat, lng: place.lng }
          : null,
    };
  const name = autoResolve?.name?.trim();
  return name ? { kind: "free", label: name } : { kind: "saved", placeId: null };
}

// 予定の下書き → createEvent のフィールド。参加者は空配列＝全員のシュガー、
// 公開範囲は shared（どちらもフォームの新規作成時の既定）。
export function eventFieldsFromDraft(d: EventDraftItem): EventFields {
  const p = d.prefill;
  const isTransit = p.kind3 === "transit";
  const { allDay, startAt, endAt } = draftEventTimes(d);
  return {
    kind: isTransit ? "transit" : "normal",
    allDay,
    title: p.title,
    startAt,
    endAt,
    // 実TZを持つのは時差移動だけ（通常・終日は常に null で毎回導出）。
    startTz: isTransit ? (p.departTz ?? d.tz) : null,
    endTz: isTransit ? (p.arriveTz ?? d.tz) : null,
    tzDisambigTransitId: p.tzDisambig?.transitId ?? null,
    tzDisambigSide: p.tzDisambig?.side ?? null,
    visibility: "shared",
    note: p.note ?? "",
    participantMemberIds: [],
    startPlace: placeInputFromDraft(p.place, p.autoResolvePlace),
    // 到着地を持つのは事前解決できた移動だけ。null＝出発地と同じ。
    endPlace: p.endPlace
      ? placeInputFromDraft(p.endPlace, p.autoResolvePlace)
      : null,
  };
}

export type ExpenseAutoContext = {
  defaultCurrency: Currency;
  // 同旅行・同通貨の既存費用のレート平均（履歴が無い通貨は入っていない）。
  averageRates: Partial<Record<Currency, number>>;
  myMemberId: string;
  activeMemberIds: string[];
};

// 費用の下書き → createExpense のフィールド。レートが決められない外貨は
// null を返す（後述）。支払者は自分、割り勘は全員、公開範囲は shared
// （いずれもフォームの新規作成時の既定）。
//
// **レートだけはユーザー入力が要ることがある**。精算通貨と同じなら 1、
// 違っても同旅行に同通貨の履歴があればその平均を使えるが、履歴が無ければ
// 決めようがない（1 で作ると金額が桁違いに壊れる）。その時だけ自動で作らず
// フォームに送る。
export function expenseFieldsFromDraft(
  d: ExpenseDraftItem,
  ctx: ExpenseAutoContext,
): ExpenseFields | null {
  // レートは実績の平均が最優先。**その通貨の1件目だけ**、取り込み時に取って
  // おいた市場レートで埋める（fxRates.ts）。市場レートよりユーザーの実効レート
  // （カード手数料込み）の方が実態に近いので、実績ができたらそちらに切り替わる。
  const rate =
    d.initialCurrency === ctx.defaultCurrency
      ? 1
      : (ctx.averageRates[d.initialCurrency] ??
        rateTo(d.fxRates, ctx.defaultCurrency) ??
        undefined);
  if (rate === undefined || rate === null) return null;
  return {
    localPrice: d.initialPrice,
    localCurrency: d.initialCurrency,
    rateToDefault: rate,
    categoryId: d.initialCategoryId,
    payerMemberId: ctx.myMemberId,
    visibility: "shared",
    splittable: true,
    splitMemberIds: ctx.activeMemberIds,
    note: "",
    paidAt: d.initialPaidAt,
    // 乗継日の選択はフォームの新規作成時と同じく持たない（両方 null＝旅程から
    // 毎回導出）。手で確定した費用と自動で作った費用で結果を変えないため。
    tzDisambigTransitId: null,
    tzDisambigSide: null,
    place: placeInputFromDraft(d.initialPlace, d.autoResolvePlace),
  };
}
