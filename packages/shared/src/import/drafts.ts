// メール取り込みの未確定下書き（inbound_drafts の pending 行）を、旅行画面の
// 確定 UI が使う形に組み立てる純関数。web（trips/[tripId]/page.tsx）と RN
// （予定タブ・費用タブ）が共有する単一の真実。
// 文言（フォールバック見出し等）は i18n 済みの文字列を呼び出し側から注入する
// （このモジュールは翻訳カタログを知らない）。

import { resolveExpenseTz, type TripTzTimeline } from "../schedule";
import type { EventRow } from "../tripDerive";
import type { Currency } from "../types/database";

import { eventDraftWhenLabel, monthDayLabel } from "./draftLabel";
import { matchPlace, type TripPlace } from "./placeMatch";
import type { EventDraft, Receipt } from "./schema";

// fetchTripPendingDrafts の1行（必要な列だけの構造的部分型）。
export type PendingDraft = { id: string; kind: string; payload: unknown };

// 保存済み場所への事前入力（matchPlace で当たった時だけ）。web の
// PlacePickerInitial の saved 分岐と同形。
export type DraftPlacePrefill = { kind: "saved"; id: string; name: string } | null;

// 保存済みに当たらなかった時の Google 自動解決の手がかり（web の PlacePicker
// autoResolve 契約）。RN は Google 自動解決を持たないので name を自由入力
// テキストとして使う。
export type DraftAutoResolvePlace = {
  name: string;
  location?: string | null;
  searchQuery?: string;
} | null;

// 費用下書き1件 → 費用フォームの事前入力一式。
export type ExpenseDraftItem = {
  id: string;
  // 確定ボタン/行に出す見出しの各部品（店名・金額・日付。縦棒区切りで描画）。
  labelParts: string[];
  initialPrice: number;
  initialCurrency: Currency;
  initialCategoryId: string;
  initialPaidAt: string; // "YYYY-MM-DD"
  initialTime?: string; // "HH:MM"（レシートに購入時刻があった時だけ）
  initialPlace: DraftPlacePrefill;
  autoResolvePlace: DraftAutoResolvePlace;
};

// 予定下書きの事前入力（開始日時・TZ 以外）。web の EventFormPrefill と同形。
export type EventDraftPrefill = {
  kind3: "timed" | "allday" | "transit";
  title: string;
  note: string | null;
  endDate: string | null;
  endTime: string | null;
  departTz: string | null;
  arriveTz: string | null;
  place: DraftPlacePrefill;
  autoResolvePlace: DraftAutoResolvePlace;
};

// 予定下書き1件 → 予定フォーム（create モード）の事前入力一式。
export type EventDraftItem = {
  id: string;
  labelParts: string[];
  date: string; // 開始日
  time: string; // 開始時刻（不明なら "09:00"）
  tz: string; // 旅程から解決した通常予定のTZ（乗継日は先頭候補）
  prefill: EventDraftPrefill;
};

// 名前・場所ヒントを保存済みの場所に照合。マッチすればそれを事前入力し、
// 無ければ null（呼び出し側が autoResolvePlace / 自由入力にフォールバック）。
function matchSavedPlace(
  name: string,
  location: string | null,
  places: TripPlace[],
): DraftPlacePrefill {
  const matched = matchPlace({ merchant: name, location }, places);
  return matched
    ? {
        kind: "saved",
        id: matched.placeId,
        name: places.find((p) => p.id === matched.placeId)?.name ?? "",
      }
    : null;
}

// 費用下書き（kind="expense"）→ 事前入力。カテゴリは抽出済みのカテゴリ名を
// その旅行の expense_categories に名前で対応づけ、無ければ fallback
// （直近入力のカテゴリ）。通貨は ISO 4217 形式でなければ精算通貨。
export function deriveExpenseDraftItems(
  drafts: PendingDraft[] | null,
  ctx: {
    categories: { id: string; name: string }[];
    defaultCurrency: Currency;
    fallbackCategoryId: string;
    places: TripPlace[];
    unknownMerchantLabel: string;
  },
): ExpenseDraftItem[] {
  return (drafts ?? [])
    .filter((d) => d.kind === "expense")
    .flatMap((d) => {
      const r = d.payload as unknown as Receipt | null;
      if (!r) return [];
      const currency: Currency = /^[A-Z]{3}$/.test(r.currency ?? "")
        ? (r.currency as Currency)
        : ctx.defaultCurrency;
      const categoryId =
        ctx.categories.find((c) => c.name === r.category)?.id ??
        ctx.fallbackCategoryId;
      const place = matchSavedPlace(r.merchant, r.location, ctx.places);
      return [
        {
          id: d.id,
          // カードの横幅が厳しいので日付は年を省いた M/D のみ（実際の日付は initialPaidAt で保持）。
          labelParts: [
            r.merchant || ctx.unknownMerchantLabel,
            `${r.total} ${r.currency}`,
            monthDayLabel(r.date),
          ],
          initialPrice: r.total,
          initialCurrency: currency,
          initialCategoryId: categoryId,
          initialPaidAt: r.date,
          // 店名はメモではなく場所へ（低確信は店名のままテキスト場所になる）。
          initialPlace: place,
          autoResolvePlace: place
            ? null
            : { name: r.merchant, location: r.location },
          initialTime: r.time ?? undefined,
        },
      ];
    });
}

// 予定下書き（kind="event"）→ 事前入力。
export function deriveEventDraftItems(
  drafts: PendingDraft[] | null,
  ctx: {
    tzTimeline: TripTzTimeline;
    places: TripPlace[];
    locale: string;
    untitledLabel: string;
    // 予約番号のメモ行（例: ref => `予約番号: ${ref}`）。
    reservationRefLabel: (ref: string) => string;
  },
): EventDraftItem[] {
  return (drafts ?? [])
    .filter((d) => d.kind === "event")
    .flatMap((d) => {
      const ev = d.payload as unknown as EventDraft | null;
      if (!ev) return [];
      // 通常予定のTZは旅程から解決（乗継日は先頭候補。フォームのラジオで選び直せる）。
      const res = resolveExpenseTz(ev.startDate, ctx.tzTimeline);
      const tz = res.kind === "single" ? res.tz : res.options[0].tz;
      // 場所欄: 出発地（transit は departLocation、それ以外はタイトル）を手がかりにする。
      // transit で出発地のターミナルが分かっていれば検索語だけ「空港名 ターミナル」を
      // 試し、高確信ならターミナル単位の場所に丸まる。低確信/不明なら素の空港名のまま
      // （autoResolvePlace.searchQuery は表示・フォールバックには影響しない）。
      const placeName = ev.kind === "transit" ? ev.departLocation : ev.title;
      const placeHint = ev.kind === "transit" ? null : ev.location;
      const place = placeName
        ? matchSavedPlace(placeName, placeHint, ctx.places)
        : null;
      const title = ev.title || ctx.untitledLabel;
      const whenLabel = eventDraftWhenLabel(ev, ctx.locale);
      // メモ: 便名と予約番号を並べる（どちらか片方だけのときはそれだけ）。
      const noteParts = [
        ev.vehicleNumber,
        ev.referenceId ? ctx.reservationRefLabel(ev.referenceId) : null,
      ].filter((p): p is string => !!p);
      return [
        {
          id: d.id,
          labelParts: [title, whenLabel],
          date: ev.startDate,
          time: ev.startTime ?? "09:00",
          tz,
          prefill: {
            kind3: ev.kind,
            title: ev.title,
            note: noteParts.length > 0 ? noteParts.join(" ・ ") : null,
            endDate: ev.endDate,
            endTime: ev.endTime,
            departTz: ev.departTz,
            arriveTz: ev.arriveTz,
            place,
            autoResolvePlace:
              place || !placeName
                ? null
                : {
                    name: placeName,
                    location: placeHint,
                    searchQuery: ev.departTerminal
                      ? `${placeName} ${ev.departTerminal}`
                      : undefined,
                  },
          },
        },
      ];
    });
}

// カレンダー上の疑似イベント id（実イベントと衝突しない）。
const DRAFT_EVENT_ID_PREFIX = "draft:";
export function draftEventId(draftId: string): string {
  return `${DRAFT_EVENT_ID_PREFIX}${draftId}`;
}
export function draftIdFromEventId(eventId: string): string | null {
  return eventId.startsWith(DRAFT_EVENT_ID_PREFIX)
    ? eventId.slice(DRAFT_EVENT_ID_PREFIX.length)
    : null;
}

// EventDraftItem（メール取り込みの未確定予定）をカレンダー描画用の疑似
// ScheduleEvent に変換する。DB には存在しない表示専用イベント（isDraft）。
export function draftToScheduleEvent(
  d: EventDraftItem,
  myMemberId: string,
): EventRow {
  const kind3 = d.prefill.kind3;
  const startAt = `${d.date}T${d.time}`;
  const endDate = d.prefill.endDate ?? d.date;
  const endAt = d.prefill.endTime ? `${endDate}T${d.prefill.endTime}` : null;
  return {
    id: draftEventId(d.id),
    title: d.labelParts[0],
    kind: kind3 === "transit" ? "transit" : "normal",
    allDay: kind3 === "allday",
    startAt,
    endAt,
    startTz: kind3 === "transit" ? (d.prefill.departTz ?? d.tz) : null,
    endTz: kind3 === "transit" ? (d.prefill.arriveTz ?? d.tz) : null,
    tzDisambigTransitId: null,
    tzDisambigSide: null,
    placeId: null,
    visibility: "shared",
    note: null,
    needsReservation: false,
    reservationDone: false,
    participantMemberIds: [], // 空 = 全員のシュガー（不参加によるdimを避ける）
    createdByMemberId: myMemberId,
    isDraft: true,
  };
}
