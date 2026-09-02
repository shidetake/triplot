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
  resolveFlightNumber,
} from "../flight";
import type { FxRates } from "../fxRates";
import type { PlaceCandidate } from "../placesSearch";
import { deriveTransitTimezones, type PlaceCoords } from "../placeTimezone";
import {
  buildTripTzTimeline,
  formatDayLabel,
  narrowTzByTime,
  pickTzByLongitude,
  resolveEventTz,
  resolveExpenseTz,
  type ScheduleEvent,
  type TripTzTimeline,
} from "../schedule";
import type { EventRow } from "../tripDerive";
import type { Currency } from "../types/database";

import { eventDraftWhenLabel, monthDayLabel } from "./draftLabel";
import { receiptPlaceName } from "./merchantName";
import { matchPlace, type TripPlace } from "./placeMatch";
import { guessImportPlaceIcon } from "./placeIconGuess";
import type { EventDraft, Receipt } from "./schema";
import { resolveTransportCategory } from "./transportCategory";
import { type FixedBlock, resolveDraftOverlaps } from "./draftOverlap";

// fetchTripPendingDrafts の1行（必要な列だけの構造的部分型）。
// email_id は「同じメールから出た費用と予定」を突き合わせるのに要る
// （片方を確定したら残りも確定する＝siblingConfirm.ts）。
export type PendingDraft = {
  id: string;
  email_id: string;
  kind: string;
  payload: unknown;
};

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
export type StoredReceipt = Receipt & {
  resolvedPlace?: PlaceCandidate | null;
  // 取り込んだ時点で取っておいた為替レート表（fxRates.ts）。その通貨の1件目を
  // 自動で確定できるようにするためのもので、実績が1件でもできれば以降は
  // その平均が優先される。
  fxRates?: FxRates | null;
};

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
  address?: string | null;
  searchQuery?: string;
} | null;

// 費用下書き1件 → 費用フォームの事前入力一式。
export type ExpenseDraftItem = {
  id: string;
  // この下書きが出てきたメール（siblingConfirm.ts が同じメールの予定を探す）。
  emailId: string;
  // 確定ボタン/行に出す見出しの各部品（店名・金額・日付。縦棒区切りで描画）。
  labelParts: string[];
  initialPrice: number;
  initialCurrency: Currency;
  initialCategoryId: string;
  initialPaidAt: string; // "YYYY-MM-DD"
  initialTime?: string; // "HH:MM"（レシートに購入時刻があった時だけ）
  // 何を買ったか（費用のメモに入る）。メールに品目が無ければ null。
  initialNote: string | null;
  // 移動日にどちらの TZ で発生したか（出発側/到着側）。曖昧でない日は null。
  // 費用フォームの初期選択に使う（予定下書きの tzDisambig と同じ契約）。
  tzDisambig: { transitId: string; side: "depart" | "arrive" } | null;
  initialPlace: DraftPlacePrefill;
  autoResolvePlace: DraftAutoResolvePlace;
  // 取り込み時のレート表（その通貨の1件目のときだけ使う）。
  fxRates: FxRates | null;
};

// 予定下書きの事前入力（開始日時・TZ 以外）。web の EventFormPrefill と同形。
export type EventDraftPrefill = {
  kind3: "timed" | "allday" | "transit";
  // 移動日にどちらの TZ を選んだか。本物の予定が持つ tzDisambigTransitId/side と
  // 同じ意味で、**これがこの下書きの TZ の決定そのもの**。フォームの初期選択も
  // カレンダーの列もここから決まる（片方だけ別経路で通すと、選択は「日本」なのに
  // 列は「ハワイ」のような食い違いが起きる）。移動日でなければ null。
  tzDisambig: { transitId: string; side: "depart" | "arrive" } | null;
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
  // draftIds の出どころのメール（重複なし）。重なりのマージは別メールの
  // 下書き同士でも起きるので複数になり得る。確定/破棄をこのメールの
  // 残りにも波及させる（siblingConfirm.ts）。
  emailIds: string[];
  labelParts: string[];
  date: string; // 開始日
  time: string; // 開始時刻（不明なら "09:00"）
  tz: string; // 旅程から解決した通常予定のTZ（prefill.tzDisambig から導かれる）
  prefill: EventDraftPrefill;
};

// 名前・場所ヒントを保存済みの場所に照合。マッチすればそれを事前入力し、
// 無ければ null（呼び出し側が resolvedPlace / autoResolvePlace / 自由入力に
// フォールバック）。
function matchSavedPlace(
  name: string,
  address: string | null,
  places: TripPlace[],
): DraftPlacePrefill {
  const matched = matchPlace({ name, address }, places);
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

// レシートから、その費用の日付（expenses.paid_at に入る値）を決める。
//
// **費用が持てる日付は paid_at ひとつだけ**なので、「支払った日」と「実際に
// 使う日」が離れるもの（航空券は数か月前に購入、宿は退室日に決済）は
// どちらか一方しか残せない。旅程に沿って読める方を採り、serviceDate
// （搭乗日・チェックイン日）があればそれを費用の日付にする。
// serviceDate を使うときは time を捨てる — time はレシートの購入時刻なので、
// 搭乗日と組み合わせると実在しない日時になる。
export function receiptDate(r: StoredReceipt | null): {
  date: string;
  time: string | undefined;
} {
  if (!r) return { date: "", time: undefined };
  if (r.serviceDate) return { date: r.serviceDate, time: undefined };
  return { date: r.date, time: r.time ?? undefined };
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
    // 移動日のタイムゾーンの初期選択に使う（予定側と同じ）。
    tzTimeline: TripTzTimeline;
  },
): ExpenseDraftItem[] {
  return (drafts ?? [])
    .filter((d) => d.kind === "expense")
    // 旅程の順（＝その費用の日付の古い順）。取り込んだ順
    // （inbound_drafts.created_at）だと、まとめて転送したメールの到着順で
    // 並ぶので旅程と関係ない並びになる。同じ日は時刻順、時刻が無いものは
    // 同日の先頭。並べる基準は receiptDate()＝実際に費用に入る日付なので、
    // 確定しても行の位置は変わらない。
    .sort((a, b) => {
      const ra = receiptDate(a.payload as unknown as StoredReceipt | null);
      const rb = receiptDate(b.payload as unknown as StoredReceipt | null);
      return (
        ra.date.localeCompare(rb.date) ||
        (ra.time ?? "").localeCompare(rb.time ?? "")
      );
    })
    .flatMap((d) => {
      const r = d.payload as unknown as StoredReceipt | null;
      if (!r) return [];
      const when = receiptDate(r);
      const currency: Currency = /^[A-Z]{3}$/.test(r.currency ?? "")
        ? (r.currency as Currency)
        : ctx.defaultCurrency;

      // 保存済みマッチ（ライブ判定）を最優先、無ければ事前解決済みの Google の
      // 場所（resolveNamedPlace 参照。apps/web/lib/import/process.ts が抽出直後
      // に仕込む）、それも無ければ自由入力テキストのまま（web だけは開いた時に
      // autoResolvePlace で再度自動解決を試みる）。
      // 場所の名前は location を優先する（receiptPlaceName 参照。merchant は
      // 請求元なので、予約サイト経由だと代理店の名前になる）。
      const placeName = receiptPlaceName(r);
      const savedPlace = matchSavedPlace(placeName, r.address, ctx.places);
      const place =
        savedPlace ??
        (r.resolvedPlace
          ? candidateToDraftPlace(
              r.resolvedPlace,
              guessImportPlaceIcon({
                category: r.category,
                eventTitle: null,
                merchant: placeName,
              }),
            )
          : null);
      // 移動日のタイムゾーンの初期選択。予定側と同じ2段（経度→時刻）。
      // ここを持たないと費用フォームは常に先頭候補＝出発側で開き、日本→
      // ホノルルの移動日に、到着後の支払いが日本時間になる。
      const tzRes = resolveExpenseTz(when.date, ctx.tzTimeline);
      const tzPicked =
        tzRes.kind === "single"
          ? null
          : (pickTzByLongitude(tzRes.options, r.resolvedPlace?.lng, when.date) ??
            narrowTzByTime(tzRes.options, ctx.tzTimeline, when.time)[0] ??
            tzRes.options[0]);
      // 移動のカテゴリは旅行全体を見ないと決まらない（resolveTransportCategory）。
      // ここまで来ると「その費用がどちらの TZ にいた時のものか」が出ているので、
      // それを使って自国側の移動を渡航に寄せる。
      const categoryName = resolveTransportCategory(
        r.category,
        tzRes.kind === "single" ? tzRes.tz : (tzPicked?.tz ?? null),
        ctx.tzTimeline,
      );
      const categoryId =
        ctx.categories.find((c) => c.name === categoryName)?.id ??
        ctx.fallbackCategoryId;
      return [
        {
          id: d.id,
          emailId: d.email_id,
          tzDisambig: tzPicked
            ? { transitId: tzPicked.transitId, side: tzPicked.side }
            : null,
          // カードの横幅が厳しいので日付は年を省いた M/D のみ（実際の日付は initialPaidAt で保持）。
          labelParts: [
            r.merchant || ctx.unknownMerchantLabel,
            `${r.total} ${r.currency}`,
            monthDayLabel(when.date),
          ],
          initialPrice: r.total,
          initialCurrency: currency,
          initialCategoryId: categoryId,
          initialPaidAt: when.date,
          // 店名はメモではなく場所へ（低確信は店名のままテキスト場所になる）。
          initialPlace: place,
          autoResolvePlace: place
            ? null
            : { name: placeName, address: r.address },
          fxRates: r.fxRates ?? null,
          initialNote: r.items ?? null,
          initialTime: when.time,
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
    // 確定した予定。下書きはこれを避ける（resolveDraftOverlaps の障害物）。
    // 渡さなければ下書きどうしの重なりだけを見る。
    events?: ScheduleEvent[];
  },
): EventDraftItem[] {
  const items = (drafts ?? [])
    .filter((d) => d.kind === "event")
    .flatMap((d) => {
      const ev = d.payload as unknown as StoredEventDraft | null;
      if (!ev) return [];
      // 通常予定のTZは旅程から解決（乗継日は先頭候補。フォームのラジオで選び直せる）。
      // 移動日は候補が2つ出る。どちら側かを、証拠の強い順に当てる:
      //
      //   1. **その移動自身が持っている TZ**（移動の下書きだけ）。抽出が乗降地
      //      から決めた値で、これ以上直接的な証拠は無い。これを見ていなかった
      //      ため、ハワイでの乗車が移動日の東京側の列に並んでいた（実機で確認）。
      //   2. 解決できた場所の経度。移動は出発地、それ以外は場所そのもの。
      //   3. 時刻で成立しない候補を落とす（narrowTzByTime）。
      //   4. どれも決められないときだけ先頭候補（＝出発側）。
      const res = resolveExpenseTz(ev.startDate, ctx.tzTimeline);
      const ownTz = ev.kind === "transit" ? (ev.departTz ?? ev.arriveTz) : null;
      const narrowed =
        res.kind === "single"
          ? []
          : narrowTzByTime(res.options, ctx.tzTimeline, ev.startTime);
      const picked =
        res.kind === "single"
          ? null
          : ((ownTz ? res.options.find((o) => o.tz === ownTz) : null) ??
            pickTzByLongitude(
              res.options,
              ev.resolvedNamedPlace?.lng ?? ev.resolvedDeparturePlace?.lng,
              ev.startDate,
            ) ??
            narrowed[0] ??
            res.options[0]);
      const tz = res.kind === "single" ? res.tz : picked!.tz;
      const tzDisambig = picked
        ? { transitId: picked.transitId, side: picked.side }
        : null;

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
          emailIds: [d.email_id],
          labelParts: [flightHeadline, eventDraftWhenLabel(ev, ctx.locale)],
          date: depDate ?? ev.startDate,
          time: depTime ?? ev.startTime ?? "09:00",
          tz,
          prefill: {
            kind3: "transit",
            // transit は departTz/arriveTz を明示的に持つので曖昧さが無い。
            tzDisambig: null,
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
      // 住所は別フィールドで持つ（schema.ts の location/address 参照）。
      // 保存済みの場所との照合でも、名前より堅い手がかりになる。
      const placeHint = ev.kind === "transit" ? null : ev.address;
      const savedPlace = placeName
        ? matchSavedPlace(placeName, placeHint, ctx.places)
        : null;
      // 保存済みマッチ（ライブ判定）を最優先、無ければ通常予定（transit 以外）で
      // 事前解決済みの Google の場所（resolveNamedPlace 参照。
      // apps/web/lib/import/process.ts が抽出直後に仕込む）。
      const place =
        savedPlace ??
        (ev.kind === "transit"
          ? // 便名で引けない移動（配車・タクシー等）の乗車地。空港は
            // resolvedDeparturePlace をフライト側の分岐で使うので、ここに
            // 来るのはそれ以外。
            (ev.resolvedDeparturePlace
              ? candidateToDraftPlace(ev.resolvedDeparturePlace, null)
              : null)
          : ev.resolvedNamedPlace
            ? candidateToDraftPlace(
                ev.resolvedNamedPlace,
                guessImportPlaceIcon({
                  category: null,
                  eventTitle: ev.title,
                  merchant: ev.location,
                }),
              )
            : null);
      // 移動の到着地（降車地）。出発地と同じ順で、保存済みの場所を最優先。
      // 空港のように施設名で書かれていれば既にあるその場所に寄る。
      // どちらにも当たらなければ**抽出した文字列を自由入力として残す**。
      // 出発地は autoResolvePlace が同じ役目を果たしていて、到着地にだけ
      // その受け皿が無かったため、解決できないと欄が空になっていた
      // （メールには書かれているのに到着地が入らない、という実機の報告）。
      const endPlaceName = ev.kind === "transit" ? ev.arriveLocation : null;
      const endPlace: EventDraftPlacePrefill = endPlaceName
        ? (matchSavedPlace(endPlaceName, null, ctx.places) ??
          (ev.resolvedArrivalPlace
            ? candidateToDraftPlace(ev.resolvedArrivalPlace, null)
            : { kind: "free", name: endPlaceName, lat: null, lng: null }))
        : null;
      const title = ev.title || ctx.untitledLabel;
      const whenLabel = eventDraftWhenLabel(ev, ctx.locale);
      // 便名は正規形に直してから使う。LLM は同じ便を "DL181" とも
      // "DELTA 181" とも書くので、生のままだと同じ便の2つの予定が違って見える
      // うえ、後者はフライト番号機能も起動しない（resolveFlightNumber 参照）。
      const flight =
        ev.kind === "transit" && ev.vehicleNumber
          ? resolveFlightNumber(ev.vehicleNumber)
          : null;
      // メモ: 便名と予約番号を並べる（どちらか片方だけのときはそれだけ）。
      // 列車・バスは正規形が無いので生の表記のまま。
      const noteParts = [
        flight?.normalized ?? ev.vehicleNumber,
        ev.referenceId ? ctx.reservationRefLabel(ev.referenceId) : null,
      ].filter((p): p is string => !!p);
      // 便名として解釈できる時だけフライト番号機能を使えるようにする
      // （列車・バス等は対象外）。
      const flightNumber = flight?.normalized ?? null;
      return [
        {
          id: d.id,
          draftIds: [d.id],
          emailIds: [d.email_id],
          labelParts: [title, whenLabel],
          date: ev.startDate,
          time: ev.startTime ?? "09:00",
          tz,
          prefill: {
            kind3: ev.kind,
            tzDisambig,
            title: ev.title,
            note: noteParts.length > 0 ? noteParts.join(" ・ ") : null,
            endDate: ev.endDate,
            endTime: ev.endTime,
            departTz: ev.departTz,
            arriveTz: ev.arriveTz,
            place,
            endPlace,
            flightNumber,
            autoResolvePlace:
              place || !placeName
                ? null
                : {
                    name: placeName,
                    address: placeHint,
                    searchQuery: ev.departTerminal
                      ? `${placeName} ${ev.departTerminal}`
                      : undefined,
                  },
          },
        },
      ];
    });

  const whenLabel = (date: string, time: string) =>
    `${formatDayLabel(date, ctx.locale)} ${time}`;

  // 会計時刻はメールの費用側に事実として入っている。同じメールの予定を
  // その時刻で並べれば、実際にどちらが先だったかが分かる。
  const receiptMinByEmail = new Map<string, number>();
  for (const d of drafts ?? []) {
    if (d.kind !== "expense") continue;
    const r = d.payload as unknown as StoredReceipt | null;
    const when = receiptDate(r);
    if (!when.date || !when.time) continue;
    const [hh, mm] = when.time.split(":").map(Number);
    receiptMinByEmail.set(
      d.email_id,
      Date.UTC(
        Number(when.date.slice(0, 4)),
        Number(when.date.slice(5, 7)) - 1,
        Number(when.date.slice(8, 10)),
      ) /
        60000 +
        hh * 60 +
        mm,
    );
  }

  // 重なった未確定どうしを整える（同じ場所はまとめ、違う場所は先勝ちで切る）。
  // 派生の最後に一度だけ通す＝web も RN も同じ結果になる。
  return resolveDraftOverlaps(
    items,
    whenLabel,
    (it) => {
      const mins = it.emailIds
        .map((id) => receiptMinByEmail.get(id))
        .filter((v): v is number => v !== undefined);
      return mins.length > 0 ? Math.min(...mins) : null;
    },
    fixedBlocks(ctx.events, ctx.tzTimeline),
  );
}

// 確定した予定を「動かせない障害物」の形にする。終日（宿泊）は他の予定と
// 重なるのが正常なので外す（宿泊を夕食と重なったからといって切ってはいけない）。
function fixedBlocks(
  events: ScheduleEvent[] | undefined,
  tl: TripTzTimeline,
): FixedBlock[] {
  const blocks: FixedBlock[] = [];
  for (const e of events ?? []) {
    // 宿泊（終日）は他の予定と重なるのが正常なので外す。移動は入れる
    // （車に乗っている間に店にはいられない）。
    if (e.allDay || !e.endAt) continue;
    // 移動は自分の TZ を持つ。通常の予定は旅程から導く。
    const tz =
      e.kind === "transit" && e.startTz
        ? e.startTz
        : resolveEventTz(
            e.startAt.slice(0, 10),
            e.tzDisambigTransitId ?? null,
            e.tzDisambigSide ?? null,
            tl,
          );
    blocks.push({
      tz,
      startAt: e.startAt,
      endAt: e.endAt,
      placeKey: e.startPlaceId ? `saved:${e.startPlaceId}` : null,
    });
  }
  return blocks;
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
// 下書きの開始/終了（壁時計）。カレンダーの疑似ブロックと、確定して実際に
// 作る予定の両方がここから取る（別々に組み立てると必ずずれる）。
//
// 終日は時刻を持たないので、endTime を条件にすると endAt が null になり
// 「初日だけの1日予定」に化ける。宿泊が初日にしか出ず、しかも複数日と
// 判定されないので乗継日に到着側の列から始める処理（layoutWeek の
// transit-depart スキップ）も効かなくなっていた。実イベントと同じく
// 日付だけで組み立てる（保存時も `${date}T00:00:00`）。
export function draftEventTimes(d: EventDraftItem): {
  allDay: boolean;
  startAt: string;
  endAt: string | null;
} {
  const endDate = d.prefill.endDate ?? d.date;
  const allDay = d.prefill.kind3 === "allday";
  return {
    allDay,
    startAt: allDay ? `${d.date}T00:00:00` : `${d.date}T${d.time}`,
    endAt: allDay
      ? `${endDate}T00:00:00`
      : d.prefill.endTime
        ? `${endDate}T${d.prefill.endTime}`
        : null,
  };
}

// 未確定の移動も含めた TZ の年表を作り、その年表で下書きを導出する。
//
// **年表が2つあると、同じ下書きが別の TZ を指す。** 確定した予定だけで年表を
// 組むと、TZ の境界がまだ仮予定のフライトの時に:
//   - 下書き側は「境界を知らない年表」で TZ を決める
//   - カレンダーの列は buildSchedule が「仮予定込みの一覧」で組み直す
// ことになり、下書きが持つ移動日の選択（tzDisambigTransitId）は列側の年表に
// 存在しない移動を指す。一致しないので先頭候補＝出発側に落ち、**ハワイの仮予定が
// 東京の列に並ぶ**（実機で確認）。
//
// 年表を1つにすれば食い違わない。2回導出するのは、仮予定の移動そのものを年表に
// 入れるため（移動の下書きの TZ は payload が持っていて年表に依存しないので、
// 1回目の結果は2回目と変わらない＝収束する）。
export function deriveEventDraftItemsWithTimeline(
  drafts: PendingDraft[] | null,
  events: ScheduleEvent[],
  defaultTimezone: string | null | undefined,
  ctx: Omit<Parameters<typeof deriveEventDraftItems>[1], "tzTimeline">,
): { items: EventDraftItem[]; tzTimeline: TripTzTimeline } {
  const confirmed = buildTripTzTimeline(events, defaultTimezone);
  const pass1 = deriveEventDraftItems(drafts, {
    ...ctx,
    tzTimeline: confirmed,
  });
  const tzTimeline = buildTripTzTimeline(
    // カレンダーの列も同じ一覧（確定＋仮）から組まれるので、移動の id が揃う。
    [...events, ...pass1.map((d) => draftToScheduleEvent(d, ""))],
    defaultTimezone,
  );
  return {
    items: deriveEventDraftItems(drafts, { ...ctx, tzTimeline, events }),
    tzTimeline,
  };
}

// 下書きの場所から座標を取る（保存済みの場所は id しか持たないので取れない）。
function coordsOfPrefill(p: EventDraftPlacePrefill): PlaceCoords | null {
  if (!p || p.kind === "saved") return null;
  return { lat: p.lat, lng: p.lng };
}

// 移動の下書きの出発TZ・到着TZ。
//
// **prefill の departTz/arriveTz は「上書き」であって実効値ではない。** 空港の
// ように座標が分かっている端点では、上書きは置かずに座標から導出する規約に
// なっている（event-form の applyFlight と同じ。上書きを埋めると後から場所を
// 直しても古い TZ が残るため）。そのまま実効値として読むと**フライトの TZ 境界が
// 消える** — 実データで、成田→ホノルルの仮予定が両側とも同じ TZ になり、
// カレンダーの列が東京のままだった。保存時と同じ導出をここでも通す。
function draftTransitTimezones(d: EventDraftItem): {
  startTz: string;
  endTz: string;
} {
  const derived = deriveTransitTimezones(
    coordsOfPrefill(d.prefill.place),
    coordsOfPrefill(d.prefill.endPlace ?? d.prefill.place),
  );
  const dep = d.prefill.departTz ?? derived.startTz;
  const arr = d.prefill.arriveTz ?? derived.endTz;
  // **片方しか決められないときは、もう片方に合わせる。** crossesTimezone と
  // 同じ規約（どちらかが決まらないなら境界にしない）。ここで既定値に落とすと
  // 幽霊の境界ができる — 実データで、乗車地だけ解決できた Uber が
  // 「ホノルル → 東京」として年表に入っていた。
  return { startTz: dep ?? arr ?? d.tz, endTz: arr ?? dep ?? d.tz };
}

export function draftToScheduleEvent(
  d: EventDraftItem,
  myMemberId: string,
): EventRow {
  const tzs =
    d.prefill.kind3 === "transit" ? draftTransitTimezones(d) : null;
  const kind3 = d.prefill.kind3;
  const { allDay: isAllDay, startAt, endAt } = draftEventTimes(d);
  return {
    id: draftEventId(d.id),
    title: d.labelParts[0],
    kind: kind3 === "transit" ? "transit" : "normal",
    allDay: kind3 === "allday",
    startAt,
    endAt,
    // 時差が無くて通常の予定に均した移動も、自分の TZ は持ったままにする
    // （buildSchedule が配置に使う。確定した予定と同じ持ち方に揃える）。
    startTz: tzs ? tzs.startTz : null,
    endTz: tzs ? tzs.endTz : null,
    tzDisambigTransitId: d.prefill.tzDisambig?.transitId ?? null,
    tzDisambigSide: d.prefill.tzDisambig?.side ?? null,
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
