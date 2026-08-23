// メール取り込みの未確定下書き（inbound_drafts の pending 行）を、旅行画面の
// 確定 UI が使う形に組み立てる純関数。web（trips/[tripId]/page.tsx）と RN
// （予定タブ・費用タブ）が共有する単一の真実。
// 文言（フォールバック見出し等）は i18n 済みの文字列を呼び出し側から注入する
// （このモジュールは翻訳カタログを知らない）。

import {
  type Flight,
  type FlightEndpoint,
  flightTerminalNote,
  flightTitle,
  parseFlightNumber,
} from "../flight";
import type { PlaceCandidate } from "../placesSearch";
import {
  formatDayLabel,
  resolveExpenseTz,
  type TripTzTimeline,
} from "../schedule";
import type { EventRow } from "../tripDerive";
import type { Currency } from "../types/database";

import { eventDraftWhenLabel, monthDayLabel } from "./draftLabel";
import { matchPlace, type TripPlace } from "./placeMatch";
import { guessImportPlaceIcon } from "./placeIconGuess";
import type { EventDraft, Receipt } from "./schema";
import { resolveDraftOverlaps } from "./draftOverlap";

// fetchTripPendingDrafts の1行（必要な列だけの構造的部分型）。
export type PendingDraft = { id: string; kind: string; payload: unknown };

// prefetchFlights（apps/web/lib/import/process.ts）が LLM 抽出後に仕込む
// 後付けデータ。LLM の出力ではないので EventDraft 本体（zod スキーマ）には
// 持たせず、保存/読み出しの境界だけこの拡張型を使う。resolvedDeparture/
// ArrivalPlace は resolvedFlight の空港を Google の場所に解決できていれば
// 入る（resolveAirportPlace 参照。見つからなければ null＝座標つき自由入力に
// フォールバック）。resolvedNamedPlace は transit 以外（レストラン・買い物等）
// の場所名を Google の場所に解決できていれば入る（resolveNamedPlace 参照。
// 座標が既知の空港と違い店名はテキスト一致度で判定する）。
export type StoredEventDraft = EventDraft & {
  resolvedFlight?: Flight | null;
  resolvedDeparturePlace?: PlaceCandidate | null;
  resolvedArrivalPlace?: PlaceCandidate | null;
  resolvedNamedPlace?: PlaceCandidate | null;
};

// prefetchFlights と同じ後付けデータ。費用の店名を Google の場所に解決
// できていれば入る（resolveNamedPlace 参照）。
export type StoredReceipt = Receipt & { resolvedPlace?: PlaceCandidate | null };

// 場所の事前入力。web の PlacePickerInitial と同形（saved/google 分岐）。
// "google" は事前解決できた場所が Google の場所と紐づいた時（resolveAirportPlace/
// resolveNamedPlace が見つけた候補。手動確定時も同じ経路で解決を試みるので、
// 同じ google_place_id になり表記違いでの重複登録が起きない）。
export type DraftPlacePrefill =
  | { kind: "saved"; id: string; name: string }
  | {
      kind: "google";
      placeId: string;
      name: string;
      address: string;
      lat: number;
      lng: number;
      region: string | null;
      locality: string | null;
      icon: string | null;
    }
  | null;

// 予定下書きの place/endPlace 専用（費用下書きにはこの分岐は無い）。
// "free" は Google 解決できなかった時のフォールバック（座標つき自由入力。
// 座標が無ければ lat/lng は null）。
export type EventDraftPlacePrefill =
  | DraftPlacePrefill
  | { kind: "free"; name: string; lat: number | null; lng: number | null };

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
  place: EventDraftPlacePrefill;
  // 到着地（時差移動のみ意味を持つ）。事前解決できたフライトがある時だけ
  // 埋まる。通常予定・未解決の移動は null（出発地と同じ扱い）。
  endPlace: EventDraftPlacePrefill;
  autoResolvePlace: DraftAutoResolvePlace;
  // vehicleNumber が実際の便名（IATA形式）として解釈でき、かつ **事前解決が
  // 見つからなかった** 時だけ入る（正規形。例: "ZG002"）。確定フォームが
  // これを見てフライト番号機能を起動し、便名を打ち直させないためのフォール
  // バック。事前解決できていれば下の他フィールドが既に確定後の状態を
  // 埋めているのでフライト番号機能は使わせない（null のまま）。
  flightNumber: string | null;
};

// 予定下書き1件 → 予定フォーム（create モード）の事前入力一式。
export type EventDraftItem = {
  id: string;
  // この項目が表す下書き行の id 一式。重なった同一店の下書きをまとめた時に
  // 2件以上になる。確定時は**全部**を解決しないと、畳んだ側が未確定のまま
  // 残って再び現れる（resolveDraftOverlaps 参照）。
  draftIds: string[];
  labelParts: string[];
  date: string; // 開始日
  time: string; // 開始時刻（不明なら "09:00"）
  tz: string; // 旅程から解決した通常予定のTZ（乗継日は先頭候補）
  prefill: EventDraftPrefill;
};

// 名前・場所ヒントを保存済みの場所に照合。マッチすればそれを事前入力し、
// 無ければ null（呼び出し側が resolvedPlace / autoResolvePlace / 自由入力に
// フォールバック）。
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

// 事前解決できた Google の場所候補を場所の事前入力にする。空港のように
// 種別が分かっている時だけ icon を明示する（それ以外は null＝DB 側の既定
// "pin"）。
function candidateToDraftPlace(
  c: PlaceCandidate,
  icon: string | null,
): DraftPlacePrefill {
  return {
    kind: "google",
    placeId: c.placeId,
    name: c.name,
    address: c.formattedAddress,
    lat: c.lat,
    lng: c.lng,
    region: c.region,
    locality: c.locality,
    icon,
  };
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
      const r = d.payload as unknown as StoredReceipt | null;
      if (!r) return [];
      const currency: Currency = /^[A-Z]{3}$/.test(r.currency ?? "")
        ? (r.currency as Currency)
        : ctx.defaultCurrency;
      const categoryId =
        ctx.categories.find((c) => c.name === r.category)?.id ??
        ctx.fallbackCategoryId;
      // 保存済みマッチ（ライブ判定）を最優先、無ければ事前解決済みの Google の
      // 場所（resolveNamedPlace 参照。apps/web/lib/import/process.ts が抽出直後
      // に仕込む）、それも無ければ自由入力テキストのまま（web だけは開いた時に
      // autoResolvePlace で再度自動解決を試みる）。
      const savedPlace = matchSavedPlace(r.merchant, r.location, ctx.places);
      const place =
        savedPlace ??
        (r.resolvedPlace
          ? candidateToDraftPlace(
              r.resolvedPlace,
              guessImportPlaceIcon({
                category: r.category,
                eventTitle: null,
                merchant: r.merchant,
              }),
            )
          : null);
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

// 事前解決できたフライトの空港を場所の事前入力にする。Google の場所として
// 解決できていれば（resolveAirportPlace が見つけた候補）それを最優先で使う
// （手動でフライト番号確定した時も同じ経路で Google 解決を試みるので、同じ
// google_place_id になり重複登録が起きない）。解決できていなければ座標つき
// 自由入力にフォールバックする（フライト番号機能の applyFlight が作る
// asPlace と同じ形。座標が無くても空港名だけで自由入力にする）。
function draftPlaceFromFlightEndpoint(
  e: FlightEndpoint,
  candidate: PlaceCandidate | null | undefined,
): EventDraftPlacePrefill {
  if (candidate) return candidateToDraftPlace(candidate, "airport");
  return { kind: "free", name: e.name, lat: e.lat, lng: e.lng };
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
  const items = (drafts ?? [])
    .filter((d) => d.kind === "event")
    .flatMap((d) => {
      const ev = d.payload as unknown as StoredEventDraft | null;
      if (!ev) return [];
      // 通常予定のTZは旅程から解決（乗継日は先頭候補。フォームのラジオで選び直せる）。
      const res = resolveExpenseTz(ev.startDate, ctx.tzTimeline);
      const tz = res.kind === "single" ? res.tz : res.options[0].tz;

      // 事前解決済みのフライト（apps/web/lib/import/process.ts の
      // prefetchFlights が抽出直後に仕込む）があれば、フライト番号機能で
      // 確定した時（event-form.tsx の applyFlight）と全フィールドを1対1で
      // 対応させて組み立てる。ユーザーがこの下書きを開いた時点で既に
      // 「あとは保存するだけ」の状態にするのが目的で、手動確定との違いを
      // 残さない（メモに便名/予約番号を混ぜない・出発地/到着地とも座標つき
      // 自由入力にする、等）。見つからなければ下のフォールバック（vehicleNumber
      // をヒントに flightNumber を渡し、確定フォーム側でフライト番号機能を
      // 起動させる）に回る。
      if (ev.kind === "transit" && ev.resolvedFlight) {
        const f = ev.resolvedFlight;
        const depDate = f.departure.scheduledLocal?.slice(0, 10);
        const depTime = f.departure.scheduledLocal?.slice(11, 16);
        const arrDate = f.arrival.scheduledLocal?.slice(0, 10);
        const arrTime = f.arrival.scheduledLocal?.slice(11, 16);
        const flightHeadline = flightTitle(f);
        const item: EventDraftItem = {
          id: d.id,
          draftIds: [d.id],
          labelParts: [flightHeadline, eventDraftWhenLabel(ev, ctx.locale)],
          date: depDate ?? ev.startDate,
          time: depTime ?? ev.startTime ?? "09:00",
          tz,
          prefill: {
            kind3: "transit",
            title: flightHeadline,
            note: flightTerminalNote(f),
            endDate: arrDate ?? null,
            endTime: arrTime ?? null,
            departTz: f.departure.lat === null ? f.departure.timeZone : null,
            arriveTz: f.arrival.lat === null ? f.arrival.timeZone : null,
            place: draftPlaceFromFlightEndpoint(
              f.departure,
              ev.resolvedDeparturePlace,
            ),
            endPlace: draftPlaceFromFlightEndpoint(
              f.arrival,
              ev.resolvedArrivalPlace,
            ),
            autoResolvePlace: null,
            flightNumber: null,
          },
        };
        return [item];
      }

      // 場所欄: 出発地（transit は departLocation、それ以外は location）を
      // 手がかりにする。title は表示用の見出しでしかなく、レシート由来の
      // 仮予定では「夕食」等の汎用語になるため検索語には使えない
      // （apps/web/lib/import/process.ts の resolveNamedPlace も同じ理由で
      // location だけを検索語にする）。location が無い時だけ title で代用する
      // （何も無いよりは手がかりになる、というクライアント側の最終フォールバック）。
      // transit で出発地のターミナルが分かっていれば検索語だけ「空港名 ターミナル」を
      // 試し、高確信ならターミナル単位の場所に丸まる。低確信/不明なら素の空港名のまま
      // （autoResolvePlace.searchQuery は表示・フォールバックには影響しない）。
      const placeName =
        ev.kind === "transit" ? ev.departLocation : (ev.location ?? ev.title);
      const placeHint = ev.kind === "transit" ? null : ev.title;
      const savedPlace = placeName
        ? matchSavedPlace(placeName, placeHint, ctx.places)
        : null;
      // 保存済みマッチ（ライブ判定）を最優先、無ければ通常予定（transit 以外）で
      // 事前解決済みの Google の場所（resolveNamedPlace 参照。
      // apps/web/lib/import/process.ts が抽出直後に仕込む）。
      const place =
        savedPlace ??
        (ev.kind !== "transit" && ev.resolvedNamedPlace
          ? candidateToDraftPlace(
              ev.resolvedNamedPlace,
              guessImportPlaceIcon({
                category: null,
                eventTitle: ev.title,
                merchant: ev.location,
              }),
            )
          : null);
      const title = ev.title || ctx.untitledLabel;
      const whenLabel = eventDraftWhenLabel(ev, ctx.locale);
      // メモ: 便名と予約番号を並べる（どちらか片方だけのときはそれだけ）。
      const noteParts = [
        ev.vehicleNumber,
        ev.referenceId ? ctx.reservationRefLabel(ev.referenceId) : null,
      ].filter((p): p is string => !!p);
      // vehicleNumber が実際の便名として解釈できる時だけフライト番号機能を
      // 使えるようにする（列車・バス等は対象外。parseFlightNumber が判定）。
      const flightNumber =
        ev.kind === "transit" && ev.vehicleNumber
          ? (parseFlightNumber(ev.vehicleNumber)?.normalized ?? null)
          : null;
      return [
        {
          id: d.id,
          draftIds: [d.id],
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
            endPlace: null,
            flightNumber,
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

  // 重なった未確定どうしを整える（同じ場所はまとめ、違う場所は中点で切る）。
  // 派生の最後に一度だけ通す＝web も RN も同じ結果になる。
  return resolveDraftOverlaps(
    items,
    (date, time) => `${formatDayLabel(date, ctx.locale)} ${time}`,
  );
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
    startPlaceId: null,
    endPlaceId: null,
    visibility: "shared",
    note: null,
    needsReservation: false,
    reservationDone: false,
    participantMemberIds: [], // 空 = 全員のシュガー（不参加によるdimを避ける）
    createdByMemberId: myMemberId,
    isDraft: true,
  };
}
