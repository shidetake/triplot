"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@/components/toast";
import { confirmDialog } from "@/components/confirm-dialog";

import { APIProvider } from "@vis.gl/react-google-maps";

import {
  createEventAction,
  deleteEventAction,
  type EventMutationState,
  updateEventAction,
} from "@/app/trips/[tripId]/actions";
import type { LatLng } from "@triplot/shared/placeMap";
import { type Flight, flightTerminalNote, flightTitle } from "@triplot/shared/flight";
import type {
  EventDraftPlacePrefill,
  EventDraftPrefill,
} from "@triplot/shared/import/drafts";
import { resolveAirportPlace, type PlaceCandidate } from "@triplot/shared/placesSearch";
import {
  dedupeTzCandidates,
  formatMinutes,
  resolveEventTz,
  resolveExpenseTz,
  type ScheduleEvent,
  type TripTzTimeline,
  type TzCandidate,
} from "@triplot/shared/schedule";
import type { Visibility } from "@triplot/shared/types/database";
import { parseYmd, formatYmd } from "@triplot/shared/ymd";

import { DatePopover } from "./date-popover";
import { DateTimePopover } from "./date-time-popover";
import { InlineDivider } from "./inline-divider";
import { TimezonePicker } from "./timezone-picker";
import { tzDisplayLabel } from "@triplot/shared/timezones";
import { FieldLabel } from "./field-label";
import { PlaneIcon } from "./icons";
import { TrashIcon, PlusIcon, SaveIcon, ChevronIcon } from "./icons";
import { PlacePicker, type PlacePickerInitial } from "./place-picker";
import { FlightPicker } from "./flight-picker";
import { deriveTransitTimezones } from "@triplot/shared/placeTimezone";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { CloseButton } from "./close-button";
import { ToggleChip } from "./toggle-chip";
import { MessageBox } from "./message-box";
import { useClearDraft, useDraft, useInSheet } from "./form-host";

const initialState: EventMutationState = { ok: false, error: null };


// セグメントトラックの各ピル（sr-only native radio を内包）。ui-guidelines「セグメントトラック」。
// sr-only radio に focus が当たるので has-[:focus-visible] でラベル側にリングを出す（a11y）。

// グリッド内のフィールド枠。min-w-0 が無いと date/time の実寸でセルが
// 広がり、ポップオーバーから input がはみ出す。
const fieldCls = "block min-w-0 text-sm";

// 予定の3種別。フライトは「予定の一種」なので入口は分けず、ここで切り替える。
//  - timed   : 通常（日付＋時刻。単一TZ）
//  - allday  : 終日（開始日〜終了日。複数日もこれ。TZ無関係）
//  - transit : タイムゾーン跨ぎ（出発と到着で日付もTZも変わる＝フライト等）
export type Kind3 = "timed" | "allday" | "transit";

// 壁時計の (date,time) ↔ 通算分。Date.UTC を計算専用に使い、ローカルTZは
// 一切経由しない（floating time を保つ）。
function dtToMin(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 60000) + hh * 60 + mm;
}
function minToDt(min: number): { date: string; time: string } {
  const dayMin = Math.floor(min / 1440) * 1440;
  const d = new Date(dayMin * 60000);
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const rem = min - dayMin;
  return { date, time: formatMinutes(rem) };
}


// 取り込み下書きの事前入力（メール取り込みの確定で使う）。開始日時・通常予定のTZは
// create モードの date/time/tz で渡すので、ここはそれ以外の初期値だけ。
export type EventFormPrefill = {
  kind3: Kind3;
  title: string;
  note: string | null;
  endDate: string | null; // timed の終了日 / allday のチェックアウト日 / transit の到着日
  endTime: string | null; // timed の終了時刻 / transit の到着時刻
  departTz: string | null; // transit のみ（null ならフォーム既定にフォールバック）
  arriveTz: string | null;
  place: PlacePickerInitial;
  // 到着地（時差移動のみ意味を持つ）。事前解決できたフライトがある時だけ埋まる。
  endPlace: PlacePickerInitial;
  autoResolvePlace: {
    name: string;
    location?: string | null;
    searchQuery?: string;
  } | null;
  // vehicleNumber が便名として解釈でき、かつ事前解決が見つからなかった時だけ
  // 入る正規形（例: "ZG002"）。入っていればフォームが最初からフライト番号
  // 機能で開く。事前解決できていれば他フィールドが既に確定後の状態を埋めて
  // いるので null のまま（フライト番号機能は起動しない）。
  flightNumber: string | null;
};

// 共有の下書き事前入力（EventDraftPrefill）→ web のフォーム用事前入力。
// place/endPlace だけ形が違う（shared は座標を name/lat/lng で持つ、web の
// PlacePickerInitial は label/coords）ので変換する。
function draftPlaceToInitial(p: EventDraftPlacePrefill): PlacePickerInitial {
  if (!p) return null;
  if (p.kind === "saved") return p;
  if (p.kind === "google") return p;
  return {
    kind: "free",
    label: p.name,
    coords: p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null,
    icon: "airport",
  };
}
export function toEventFormPrefill(p: EventDraftPrefill): EventFormPrefill {
  return {
    ...p,
    place: draftPlaceToInitial(p.place),
    endPlace: draftPlaceToInitial(p.endPlace),
  };
}

export type EventFormMode =
  | {
      mode: "create";
      date: string;
      time: string;
      tz: string;
      // 起動時に終日種別を選んでおきたい時のヒント（終日帯の長押し追加経路）。
      allDay?: boolean;
      // PC ドラッグで作成した時の終了時刻("HH:MM")。同日扱い。未指定なら
      // 既存の "開始+1時間" がデフォルト。
      endTime?: string;
      // 取り込み下書きの事前入力。
      prefill?: EventFormPrefill;
    }
  | { mode: "edit"; event: ScheduleEvent; canChangeVisibility: boolean };

function initialKind3(ev: ScheduleEvent | null, allDayHint: boolean): Kind3 {
  if (!ev) return allDayHint ? "allday" : "timed";
  if (ev.kind === "transit") return "transit";
  if (ev.allDay) return "allday";
  return "timed";
}

export function EventForm({
  tripId,
  defaultTz,
  tripStart,
  tripEnd,
  state: formMode,
  places,
  members,
  biasCenter,
  tzTimeline,
  onDone,
  onSuccess,
  onDismissDraft,
}: {
  tripId: string;
  defaultTz: string; // 個別TZの初期値（= 前回入力 or ブラウザTZ）
  tripStart: string | null; // カレンダーの旅行期間ハイライト用
  tripEnd: string | null;
  state: EventFormMode;
  // lat/lng は移動の TZ を場所から導出できるか判定するのに使う。
  places: { id: string; name: string; lat: number | null; lng: number | null }[];
  members: { id: string; display_name: string; color: number | null }[];
  biasCenter: LatLng; // Google 検索の地理バイアス（既存ピンの重心 or 東京）
  tzTimeline: TripTzTimeline;
  onDone: () => void;
  // 追加/更新が成功したときだけ呼ぶ（× 閉じでは呼ばれない）。追加成功時は
  // 作成した予定の id が渡る（取り込み下書きの確定リンクに使う）。
  onSuccess?: (eventId?: string) => void;
  // 取り込み下書きの確定フローで開いた時だけ渡る: この下書きを破棄する。
  // 狭い画面はカレンダー上の疑似ブロックからしかこのフォームに来られず、
  // 一覧側の × が無いので、ここに破棄の口が無いと消せなくなる。
  onDismissDraft?: () => void;
}) {
  const isEdit = formMode.mode === "edit";
  const ev = isEdit ? formMode.event : null;
  const prefill = formMode.mode === "create" ? (formMode.prefill ?? null) : null;
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // 場所欄の初期値。編集時は既存の place_id から復元する（自由入力も
  // place_id に解決済みなので saved として戻る）。新規は取り込みの事前入力。
  const placePickerInitial: PlacePickerInitial = ev?.startPlaceId
    ? {
        kind: "saved",
        id: ev.startPlaceId,
        name: places.find((p) => p.id === ev.startPlaceId)?.name ?? "",
      }
    : (prefill?.place ?? null);

  const action = isEdit
    ? updateEventAction.bind(null, tripId)
    : createEventAction.bind(null, tripId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  // ボトムシート時は入力途中で閉じても残るよう、データ系 state は useDraft で保持する
  // （ポップオーバー時は draftKey が無いので素の useState 相当）。
  const inSheet = useInSheet();
  const clearDraft = useClearDraft();

  const endPlacePickerInitial: PlacePickerInitial = ev?.endPlaceId
    ? {
        kind: "saved",
        id: ev.endPlaceId,
        name: places.find((p) => p.id === ev.endPlaceId)?.name ?? "",
      }
    : (prefill?.endPlace ?? null);

  // タイトル欄をフライト番号入力に入れ替えているか。メール取り込み下書きの
  // 確定で便名がフライトとして解釈できていれば最初からこのモードで開く
  // （打ち直させない。手入力と同じ経路を通るので確定後の結果は区別が付かない）。
  const [flightMode, setFlightMode] = useState(() => !!prefill?.flightNumber);
  // 下書き由来で自動起動した最初の1回だけ、見つかった便をタップ無しで
  // 即確定する（便名は予約メールに書かれていた実在の値なので手打ちの
  // ような打ち間違いのリスクが無い）。ユーザーが飛行機アイコンから
  // 手動で開き直した場合は false のまま＝通常どおりタップして確定する。
  const [autoApplyFlight, setAutoApplyFlight] = useState(
    () => !!prefill?.flightNumber,
  );
  // フライトから入れた場所。PlacePicker は非制御なので、値を差し替えるには
  // initial を変えて remount する（key に世代番号を使う）。
  const [flightPlaces, setFlightPlaces] = useState<{
    gen: number;
    start: PlacePickerInitial;
    end: PlacePickerInitial;
  } | null>(null);

  /**
   * プレビューで確定したフライトをフォームに流し込む。
   *
   * 空港は**座標つきの自由入力**として渡す（Google 由来ではないので place spec の
   * freetext 枝。座標があるので地図にピンが立つ）。PlacePicker は非制御なので
   * initial を差し替えて remount する。
   */
  const applyFlight = (f: Flight) => {
    setAutoApplyFlight(false);
    setTitle(flightTitle(f));
    setKind3("transit");
    // 出発/到着どちらかのターミナルがわかればメモに書く（片方欠けは "--"）。
    // 両方とも不明なときだけメモは触らない。既存のメモ（下書き確定時の
    // 予約番号など）は上書きせず残す（区切りは deriveEventDraftItems と
    // 同じ " ・ "）。
    const terminalNote = flightTerminalNote(f);
    if (terminalNote) {
      setNote((prev) =>
        prev.trim() ? `${prev} ・ ${terminalNote}` : terminalNote,
      );
    }

    const asInitial = (e: Flight["departure"]): PlacePickerInitial => ({
      kind: "free",
      label: e.name,
      coords: e.lat !== null && e.lng !== null ? { lat: e.lat, lng: e.lng } : null,
      icon: "airport",
    });
    const asGoogleInitial = (c: PlaceCandidate): PlacePickerInitial => ({
      kind: "google",
      placeId: c.placeId,
      name: c.name,
      address: c.formattedAddress,
      lat: c.lat,
      lng: c.lng,
      region: c.region,
      locality: c.locality,
      icon: "airport",
    });
    setFlightPlaces((prev) => ({
      gen: (prev?.gen ?? 0) + 1,
      start: asInitial(f.departure),
      end: asInitial(f.arrival),
    }));

    // 裏で Google の場所として解決を試みる（メール取り込みの事前解決
    // 〔prefetchFlights〕と同じ考え方）。見つかれば座標つき自由入力から
    // Google の場所に差し替え、表記違い（"Tokyo Narita" / "成田国際空港"）
    // での重複登録を避ける。見つからなければ何もしない（座標つき自由入力の
    // まま＝機能の前提ではなく表示上の改善）。
    if (mapsApiKey) {
      void (async () => {
        const [dep, arr] = await Promise.all([
          resolveAirportPlace(f.departure, { apiKey: mapsApiKey }),
          resolveAirportPlace(f.arrival, { apiKey: mapsApiKey }),
        ]);
        if (!dep && !arr) return;
        setFlightPlaces((prev) => ({
          gen: (prev?.gen ?? 0) + 1,
          start: dep ? asGoogleInitial(dep) : (prev?.start ?? asInitial(f.departure)),
          end: arr ? asGoogleInitial(arr) : (prev?.end ?? asInitial(f.arrival)),
        }));
      })();
    }

    if (f.departure.scheduledLocal) {
      setDepartDate(f.departure.scheduledLocal.slice(0, 10));
      setDepartTime(f.departure.scheduledLocal.slice(11, 16));
    }
    if (f.arrival.scheduledLocal) {
      setArriveDate(f.arrival.scheduledLocal.slice(0, 10));
      setArriveTime(f.arrival.scheduledLocal.slice(11, 16));
    }
    // TZ は**座標から導出できるなら上書きしない**。上書き（*TzOverride）は
    // 「ユーザーが明示的に選んだ」の意味で、ここで埋めると後から場所を直しても
    // 古い TZ が残る。空港の座標があれば導出が同じ答えを出す（tz-lookup）ので、
    // 座標が無い端点だけ提供元の IANA を明示値として入れる。
    setDepartTz(f.departure.lat === null ? (f.departure.timeZone ?? "") : "");
    setArriveTz(f.arrival.lat === null ? (f.arrival.timeZone ?? "") : "");

    setFlightMode(false);
  };

  const [kind3, setKind3] = useDraft<Kind3>(
    "kind3",
    prefill?.kind3 ??
      initialKind3(ev, formMode.mode === "create" && formMode.allDay === true),
  );
  const [visibility, setVisibility] = useDraft<Visibility>(
    "visibility",
    isEdit ? ev!.visibility : "shared",
  );
  // 要予約。ON で「〇〇の予約」TODO（優先度:高）が紐づく。共有予定のみ
  // （private は共有TODOリストに漏れるため）。
  const [needsReservation, setNeedsReservation] = useDraft<boolean>(
    "needsReservation",
    isEdit ? ev!.needsReservation : false,
  );

  // タイトル・メモは元々 uncontrolled（defaultValue）だが、シートのアンマウントを跨いで
  // 残すため controlled にする。
  const [title, setTitle] = useDraft<string>(
    "title",
    ev?.title ?? prefill?.title ?? "",
  );
  const [note, setNote] = useDraft<string>(
    "note",
    ev?.note ?? prefill?.note ?? "",
  );

  // 参加者。「全員」モードと「個別」モードの2状態。
  //  - "all"    = 全員参加（送信時は participant_member_ids を一切送らない）
  //  - "custom" = 部分集合（選んだメンバーIDだけ hidden input で送る）
  // 編集モードで既存参加者が居れば最初から custom 開始。
  const initialCustom = isEdit && (ev?.participantMemberIds.length ?? 0) > 0;
  const [pMode, setPMode] = useDraft<"all" | "custom">(
    "pMode",
    initialCustom ? "custom" : "all",
  );
  const [pSelected, setPSelected] = useDraft<Set<string>>("pSelected", () => {
    if (initialCustom) return new Set(ev!.participantMemberIds);
    return new Set(members.map((m) => m.id));
  });
  const toggleParticipant = (id: string) => {
    setPSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // 最後の1人を残す（0 人になると意味不明な予定になる）
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const [isDeleting, startDelete] = useTransition();

  useEffect(() => {
    if (state.ok) {
      clearDraft(); // 成功＝この下書きは用済み（シート時のみ実体あり）
      onSuccess?.(state.eventId); // 成功時のみ（取り込み下書きを確定済みにする等）
      onDone();
    }
  }, [state.ok, state.eventId, onSuccess, onDone, clearDraft]);

  // 壁時計文字列を date / time に割る
  const splitWall = (s: string | null) => {
    if (!s) return { date: "", time: "" };
    return { date: s.slice(0, 10), time: s.slice(11, 16) };
  };
  const startInit = isEdit
    ? splitWall(ev!.startAt)
    : { date: formMode.date, time: formMode.time };
  const endInit = isEdit ? splitWall(ev!.endAt) : { date: "", time: "" };
  // 通常予定用の実効TZ初期値。乗継日以外は旅程から自動導出、乗継日は保存済み
  // の選択（tzDisambig*）で候補から引く。時差移動の出発/到着TZ（下）とは別。
  const tzInit = isEdit
    ? resolveEventTz(
        splitWall(ev!.startAt).date,
        ev!.tzDisambigTransitId,
        ev!.tzDisambigSide,
        tzTimeline,
      )
    : formMode.tz;
  const endTzInit = isEdit ? (ev!.endTz ?? defaultTz) : defaultTz;

  // 通常イベントの開始/終了は controlled。開始を動かすと長さを保って
  // 終了が追従。終了は必須で、既定は開始の1時間後。
  const initSMin = dtToMin(
    startInit.date || "2026-01-01",
    startInit.time || "09:00",
  );
  const [sDate, setSDate] = useDraft("sDate", startInit.date || "2026-01-01");
  const [sTime, setSTime] = useDraft("sTime", startInit.time || "09:00");
  const initEMin =
    isEdit && endInit.date
      ? dtToMin(endInit.date, endInit.time || "00:00")
      : prefill && (prefill.endDate || prefill.endTime)
        ? dtToMin(
            prefill.endDate || startInit.date,
            prefill.endTime || startInit.time || "09:00",
          )
        : formMode.mode === "create" && formMode.endTime
          ? dtToMin(formMode.date, formMode.endTime)
          : initSMin + 60;
  const [eDate, setEDate] = useDraft("eDate", minToDt(initEMin).date);
  const [eTime, setETime] = useDraft("eTime", minToDt(initEMin).time);

  // 通常予定のTZ。乗継日（複数候補あり）のみユーザが選択する。それ以外は
  // 旅程タイムラインから一意に解決 → UI を出さずに hidden で送る。
  // tz = 表示用の実効値、tzDisambig* = 保存する選択（乗継日
  // 以外は両方 null のまま＝毎回自動導出）。
  const startResolution = resolveExpenseTz(startInit.date, tzTimeline);
  // 編集時、保存済みの選択が無い（=マイグレーション前の既存データ、または
  // 自動導出のまま保存された）乗継日は、tz と同じ先頭候補をラジオにも
  // 反映する（「実際は選ばれているのにどれもチェックが付いていない」を防ぐ）。
  const editDisambig =
    isEdit && startResolution.kind === "ambiguous"
      ? ev!.tzDisambigTransitId && ev!.tzDisambigSide
        ? { transitId: ev!.tzDisambigTransitId, side: ev!.tzDisambigSide }
        : startResolution.options[0]
      : null;
  // 新規作成時、長押しした列が乗継日の候補のどれかに一致するならその候補を
  // 既定選択にする（week-calendar 側で列ごとに解決済みの formMode.tz と
  // 揃える。一致しなければ先頭候補＝出発側）。
  const createDisambig =
    !isEdit && startResolution.kind === "ambiguous" && formMode.mode === "create"
      ? (startResolution.options.find((o) => o.tz === formMode.tz) ??
        startResolution.options[0])
      : null;
  const [tz, setTzRaw] = useDraft("tz", tzInit);
  const [tzDisambigTransitId, setTzDisambigTransitId] = useDraft<
    string | null
  >(
    "tzDisambigTransitId",
    editDisambig?.transitId ?? createDisambig?.transitId ?? null,
  );
  const [tzDisambigSide, setTzDisambigSide] = useDraft<
    "depart" | "arrive" | null
  >("tzDisambigSide", editDisambig?.side ?? createDisambig?.side ?? null);
  const selectTz = (c: TzCandidate) => {
    setTzRaw(c.tz);
    setTzDisambigTransitId(c.transitId);
    setTzDisambigSide(c.side);
  };
  const tzRes = useMemo(
    () => resolveExpenseTz(sDate, tzTimeline),
    [sDate, tzTimeline],
  );
  const multiTz = tzTimeline.transits.length > 0;

  // 時差移動の到着の既定（新規時）。通常イベントと同様、出発の1時間後。
  // 出発フィールドは uncontrolled なので初期値だけ合わせる（"とりあえず"の既定）。
  const transitArriveInit = minToDt(initSMin + 60);

  // 時差移動は出発・到着をそれぞれ DateTimePopover（日付＋時刻チップ＝通常予定と同じ仕様）で
  // 編集するので、日付・時刻とも controlled state を持つ。
  // 出発をずらすと到着も同じ差分だけ追従する（通常予定と同じ仕様。所要時間は
  // 変わらないため）。出発と到着で TZ が違っても、壁時計に同じ差分を足せば実
  // 所要時間は保たれる（TZ の差は両端で不変）。
  const [departDate, setDepartDate] = useDraft("departDate", startInit.date);
  const [departTime, setDepartTime] = useDraft(
    "departTime",
    startInit.time || "09:00",
  );
  const [arriveDate, setArriveDate] = useDraft(
    "arriveDate",
    endInit.date || prefill?.endDate || transitArriveInit.date,
  );
  const [arriveTime, setArriveTime] = useDraft(
    "arriveTime",
    endInit.time || prefill?.endTime || transitArriveInit.time,
  );
  // 時差移動は常に実IANA文字列（transitイベントのstart_tz/end_tzは必ず非null）。
  const departTzInit = isEdit
    ? (ev!.startTz ?? defaultTz)
    : (prefill?.departTz ?? formMode.tz);
  const [tzExpanded, setTzExpanded] = useState(false);
  // 場所欄（非制御）から座標を受け取り、移動の TZ をそこから導出する。
  // ユーザーが TZ ピッカーで明示的に選んだらそちらを優先する（下の *Override）。
  const [startCoords, setStartCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [endCoords, setEndCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [departTzOverride, setDepartTz] = useDraft("departTz", "");
  const [arriveTzOverride, setArriveTz] = useDraft("arriveTz", "");
  const derivedTz = deriveTransitTimezones(startCoords, endCoords ?? startCoords);
  const departTz =
    departTzOverride || derivedTz.startTz || departTzInit;
  const arriveTz =
    arriveTzOverride || derivedTz.endTz || prefill?.arriveTz || endTzInit;
  const [alldayStart, setAlldayStart] = useDraft("alldayStart", startInit.date);
  const [alldayEnd, setAlldayEnd] = useDraft(
    "alldayEnd",
    endInit.date || prefill?.endDate || startInit.date,
  );

  // 開始を動かすと長さ（日付込み）を保って終了が追従する（DateTimePopover から呼ぶ）。
  // DateTimePopover は日付だけの変更も時刻だけの変更も同じ onChange(date,time) で
  // 通知してくる。TZ の再解決は日付が実際に変わったときだけ行う — 時刻だけの調整で
  // 毎回呼び直すと、乗継日でユーザーがラジオボタンで手動選んだ側が黙って
  // 既定（出発側）に巻き戻ってしまう。
  const moveStart = (nd: string, nt: string) => {
    const dur = Math.max(dtToMin(eDate, eTime) - dtToMin(sDate, sTime), 60);
    const dateChanged = nd !== sDate;
    setSDate(nd);
    setSTime(nt);
    const ne = minToDt(dtToMin(nd, nt) + dur);
    setEDate(ne.date);
    setETime(ne.time);
    if (dateChanged) {
      const r = resolveExpenseTz(nd, tzTimeline);
      if (r.kind === "single") {
        setTzRaw(r.tz);
        setTzDisambigTransitId(null);
        setTzDisambigSide(null);
      } else {
        selectTz(r.options[0]);
      }
    }
  };

  // 終了ガード。終了 ≤ 開始になったら開始+1時間に snap する（同日に終了時刻だけ
  // 開始より前にした／前の日付を選んだケースを最小1時間で吸収）。
  const setEnd = (nd: string, nt: string) => {
    const sMin = dtToMin(sDate, sTime);
    const eMin = dtToMin(nd, nt);
    if (eMin <= sMin) {
      const ne = minToDt(sMin + 60);
      setEDate(ne.date);
      setETime(ne.time);
    } else {
      setEDate(nd);
      setETime(nt);
    }
  };

  // allday の開始ガード。終了 picker は開始より前を disable しているので
  // 「終了 → 開始」方向の逆転は picker で防止済み。逆方向（開始を終了より
  // 後にする）が来た場合は単日扱いで end も開始日に揃える。
  const setAlldayStartG = (v: string) => {
    setAlldayStart(v);
    if (v > alldayEnd) setAlldayEnd(v);
  };

  const locale = useLocale();
  const t = useTranslations("event");
  const tCommon = useTranslations("common");
  const tImport = useTranslations("import");

  // 終日は「日時の見せ方」を変えるコントロールなので日時と同じ行の右端に置く
  // （行末の余白が使えて1行節約できる）。入り切らない幅では flex-wrap で
  // 折り返し、その場合は従来どおり日時の下に落ちる。
  const allDayCheckbox = (
    <label className="ml-auto flex shrink-0 items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={kind3 === "allday"}
        onChange={(e) => setKind3(e.target.checked ? "allday" : "timed")}
      />
      {t("kindAllday")}
    </label>
  );

  const canChangeVis = isEdit ? formMode.canChangeVisibility : true;

  const onDelete = async () => {
    if (!ev) return;
    if (!(await confirmDialog({ title: t("deleteTitle") }))) return;
    startDelete(async () => {
      const { error } = await deleteEventAction(tripId, ev.id);
      if (error) {
        toast(t("deleteFailed", { error }));
        return;
      }
      clearDraft(); // 対象が消えたので下書きも破棄
      onDone();
    });
  };

  // 種別 → サーバ契約（kind / all_day）への写像。hidden で送る。
  const submitKind = kind3 === "transit" ? "transit" : "normal";

  return (
    <form
      action={formAction}
      className={`relative space-y-3 p-4 ${inSheet ? "" : "rounded-md border border-foreground/10 bg-background"}`}
    >
      {/* × は専用行を作らず右上角に重ねる（縦を 1 行ぶん詰める）。先頭の種別トラックが
          下に潜らないよう、トラック側に右クリアランス（mr）を入れる。
          ボトムシート時は × を出さず下スワイプで閉じる（Instagram と同じ）。 */}
      {!inSheet && (
        <CloseButton onClick={onDone} className="absolute right-2 top-2 z-10" />
      )}

      <input type="hidden" name="kind" value={submitKind} />
      {kind3 === "allday" && (
        <input type="hidden" name="all_day" value="on" />
      )}
      {isEdit && <input type="hidden" name="event_id" value={ev!.id} />}

      {/* ラベルは置かず placeholder＝フィールド名（iOS カレンダー方式）。
          可視ラベルが無いぶん aria-label で名前を担保する。
          右端の飛行機アイコンで**この行がフライト番号入力に入れ替わる**。
          専用の行を足すとフォームが縦に伸びるので入れ替えにしている。
          アイコンは入力欄の内側右端に重ねる（iOS の検索欄のマイクと同じ形。
          place-search.tsx の検索クリアボタンと同じ relative/pr-9 パターン）。
          入れ替え中も title は hidden で送る（required を満たすため）。 */}
      {flightMode ? (
        <>
          <input type="hidden" name="title" value={title} />
          <FlightPicker
            date={kind3 === "allday" ? alldayStart : kind3 === "transit" ? departDate : sDate}
            initialNumber={prefill?.flightNumber ?? undefined}
            autoApply={autoApplyFlight}
            onCancel={() => {
              setAutoApplyFlight(false);
              setFlightMode(false);
            }}
            onApply={applyFlight}
          />
        </>
      ) : (
        <div className="relative">
          <Input
            type="text"
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("title")}
            aria-label={t("title")}
            className="block w-full pr-9"
          />
          <Button
            type="button"
            variant="ghost"
            size="iconDense"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full"
            onClick={() => {
              setAutoApplyFlight(false);
              setFlightMode(true);
            }}
            title={t("flightAria")}
            aria-label={t("flightAria")}
          >
            <PlaneIcon size={16} />
          </Button>
        </div>
      )}

      {/* 種別は宣言させず、入力の結果として決まる。移動は「出す欄」を変える
          （到着地・TZ）ので場所より前に置く。終日は日時の見た目だけ変えるので
          日時の行に置く。
          排他は非対称にする。**移動 ON → 終日を消す**（移動では終日があり得ず、
          日時行ごと切り替わるので自然に出ない）。**終日 ON → 移動は残して無効化**。
          移動は「どの欄が存在するか」を決める上位の切り替えで、日時行の下位
          オプションである終日を触ったせいで画面から消えるのは筋が悪い。 */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={kind3 === "transit"}
          disabled={kind3 === "allday"}
          onChange={(e) => setKind3(e.target.checked ? "transit" : "timed")}
        />
        {t("kindMove")}
      </label>

      <div className="block text-sm">
        {mapsApiKey ? (
          <APIProvider apiKey={mapsApiKey} language={locale}>
            <PlacePicker
              places={places}
              biasCenter={biasCenter}
              key={flightPlaces?.gen ?? 0}
              initial={flightPlaces?.start ?? placePickerInitial}
              autoResolve={prefill?.autoResolvePlace}
              onCoordsChange={setStartCoords}
              placeholder={kind3 === "transit" ? t("startPlace") : t("place")}
            />
          </APIProvider>
        ) : (
          <PlacePicker
            places={places}
            biasCenter={biasCenter}
            key={flightPlaces?.gen ?? 0}
            initial={flightPlaces?.start ?? placePickerInitial}
            autoResolve={prefill?.autoResolvePlace}
            onCoordsChange={setStartCoords}
            placeholder={kind3 === "transit" ? t("startPlace") : t("place")}
          />
        )}
      </div>

      {/* 移動のときだけ到着地。時差の無い国内移動でも到着地を書けるように、
          「時差移動」ではなく「移動」で出す（TZ が同じなら通常予定として保存）。 */}
      {kind3 === "transit" && (
        <div className="block text-sm">
          {mapsApiKey ? (
            <APIProvider apiKey={mapsApiKey} language={locale}>
              <PlacePicker
                namePrefix="end_"
                places={places}
                biasCenter={biasCenter}
                key={flightPlaces?.gen ?? 0}
                initial={flightPlaces?.end ?? endPlacePickerInitial}
                onCoordsChange={setEndCoords}
                placeholder={t("endPlace")}
              />
            </APIProvider>
          ) : (
            <PlacePicker
              namePrefix="end_"
              places={places}
              biasCenter={biasCenter}
              key={flightPlaces?.gen ?? 0}
              initial={flightPlaces?.end ?? endPlacePickerInitial}
              onCoordsChange={setEndCoords}
              placeholder={t("endPlace")}
            />
          )}
        </div>
      )}

      {/* 出発＝日付＋時刻、到着＝時刻（別日なら ±N日）の横並び。通常予定の「開始 – 終了」と同じ表示。
          出発・到着は別TZが前提なので追従/ガードは入れず独立（到着は前日 -1日もあり得るので
          到着エディタの日付制限もしない）。 */}
      {kind3 === "transit" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("dateTime")}</span>
            <div className="flex items-center gap-2">
              <DateTimePopover
                variant="start"
                date={departDate}
                time={departTime}
                onChange={(d, td) => {
                  const deltaMs =
                    Date.parse(`${d}T${td}:00`) -
                    Date.parse(`${departDate}T${departTime}:00`);
                  setDepartDate(d);
                  setDepartTime(td);
                  if (deltaMs !== 0) {
                    const ne = new Date(
                      Date.parse(`${arriveDate}T${arriveTime}:00`) + deltaMs,
                    );
                    setArriveDate(formatYmd(ne));
                    setArriveTime(
                      `${String(ne.getHours()).padStart(2, "0")}:${String(
                        ne.getMinutes(),
                      ).padStart(2, "0")}`,
                    );
                  }
                }}
                tripStart={tripStart}
                tripEnd={tripEnd}
                label={t("departDateTime")}
              />
              <span className="shrink-0 text-muted-foreground">–</span>
              <DateTimePopover
                variant="end"
                date={arriveDate}
                time={arriveTime}
                baseDate={departDate}
                onChange={(d, td) => {
                  setArriveDate(d);
                  setArriveTime(td);
                }}
                tripStart={tripStart}
                tripEnd={tripEnd}
                label={t("arriveDateTime")}
              />
            </div>
          </div>

          <input type="hidden" name="depart_date" value={departDate} />
          <input type="hidden" name="depart_time" value={departTime} />
          <input type="hidden" name="arrive_date" value={arriveDate} />
          <input type="hidden" name="arrive_time" value={arriveTime} />

          {/* TZ は場所の座標から自動で決まるので、既定は結果を1行見せるだけ
              （3段ネストのピッカーを触らせない）。座標が無くて決められないときと、
              ユーザーが変えたいときだけ開く。値は常に hidden で送る。 */}
          <input type="hidden" name="depart_tz" value={departTz} />
          <input type="hidden" name="arrive_tz" value={arriveTz} />
          {/* **自動では開かない。** 「決められないときだけ開く」にすると、
              出発地が空の初期状態がまさにそれに当たり、入力していくと編集欄が
              消えるという逆向きの挙動になる（実機フィードバック）。常に1行の
              行を出し、押したときだけピッカーを開く。場所から決められないときは
              旅行の既定 TZ が入るので、触らなくても破綻しない。
              **開いたら閉じられる**（開閉行は往復できるのが普通）。重複を避ける
              ため、開いている間は値を出さない（値はピッカー側に見えている）。 */}
          <button
            type="button"
            onClick={() => setTzExpanded((v: boolean) => !v)}
            aria-expanded={tzExpanded}
            className="mt-1 flex w-full items-center gap-2 text-sm"
          >
            <span className="text-muted-foreground">{t("timezone")}</span>
            {!tzExpanded && (
              <span>
                {tzDisplayLabel(departTz)} → {tzDisplayLabel(arriveTz)}
              </span>
            )}
            <ChevronIcon
              size={16}
              className={`text-muted-foreground ${tzExpanded ? "rotate-90" : ""}`}
            />
          </button>
          {tzExpanded && (
            <div className="grid grid-cols-2 gap-2">
              <label className={`${fieldCls} mt-1 block`}>
                <span className="text-muted-foreground">{t("departTz")}</span>
                <div className="mt-1">
                  <TimezonePicker value={departTz} onChange={setDepartTz} />
                </div>
              </label>
              <label className={`${fieldCls} mt-1 block`}>
                <span className="text-muted-foreground">{t("arriveTz")}</span>
                <div className="mt-1">
                  <TimezonePicker value={arriveTz} onChange={setArriveTz} />
                </div>
              </label>
            </div>
          )}
        </div>
      )}

      {kind3 === "allday" && (
        // 開始日–終了日を横並び（通常予定の日時と同じ並び・時刻なし）。
        // 入力は従来どおりカレンダーのみ（DatePopover）。終日はTZ無関係（tz は送らない）。
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("date")}</span>
          <div className="flex items-center gap-2">
            <DatePopover
              closeOnSelect={false}
              name="start_date"
              value={alldayStart}
              onChange={setAlldayStartG}
              required
              className="w-auto shrink-0"
              tripStart={tripStart}
              tripEnd={tripEnd}
            />
            <span className="shrink-0 text-muted-foreground">–</span>
            <DatePopover
              closeOnSelect={false}
              name="end_date"
              value={alldayEnd}
              onChange={setAlldayEnd}
              required
              className="w-auto shrink-0"
              tripStart={tripStart}
              tripEnd={tripEnd}
              disabled={
                parseYmd(alldayStart)
                  ? { before: parseYmd(alldayStart)! }
                  : undefined
              }
            />
          </div>
          {allDayCheckbox}
        </div>
      )}

      {kind3 === "timed" && (
        <div className="space-y-3">
          {/* 開始＝日付＋時刻、終了＝時刻（＋別日なら「+N日」）の 2 つの要約チップ。
              どちらをタップしても同じ結合エディタ（カレンダー＋時刻）が開く＝iOS カレンダー方式。
              送信値は hidden で流す（チップは UI 専用の controlled 部品）。 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("dateTime")}</span>
            <div className="flex items-center gap-2">
              <DateTimePopover
                variant="start"
                date={sDate}
                time={sTime}
                onChange={moveStart}
                tripStart={tripStart}
                tripEnd={tripEnd}
                label={t("startDateTime")}
              />
              <span className="shrink-0 text-muted-foreground">–</span>
              <DateTimePopover
                variant="end"
                date={eDate}
                time={eTime}
                baseDate={sDate}
                onChange={setEnd}
                tripStart={tripStart}
                tripEnd={tripEnd}
                disabled={
                  parseYmd(sDate) ? { before: parseYmd(sDate)! } : undefined
                }
                label={t("endDateTime")}
              />
            </div>
            {allDayCheckbox}
          </div>

          <input type="hidden" name="start_date" value={sDate} />
          <input type="hidden" name="start_time" value={sTime} />
          <input type="hidden" name="end_date" value={eDate} />
          <input type="hidden" name="end_time" value={eTime} />

          {/* TZ は常に hidden で送る（フォームが解決に成功したかのガード）。
              乗継日（複数候補）のみラジオで選ばせる。それ以外はタイムラインから
              一意に解決。保存されるのは tz_disambig_* だけで、実際のTZ文字列
              (tz) 自体は保存されない。 */}
          <input type="hidden" name="tz" value={tz} />
          <input
            type="hidden"
            name="tz_disambig_transit_id"
            value={tzDisambigTransitId ?? ""}
          />
          <input
            type="hidden"
            name="tz_disambig_side"
            value={tzDisambigSide ?? ""}
          />
          {multiTz && tzRes.kind === "ambiguous" && (
            <fieldset className="text-sm">
              <p className="text-xs text-muted-foreground">{t("transitDay")}</p>
              {/* 同じ TZ の候補は畳む（移動が複数あると重複して並ぶ）。選択状態も
                  TZ 単位で照合する（実体の transitId/side は selectTz が保持）。 */}
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                {dedupeTzCandidates(tzRes.options).map((opt) => (
                  <label
                    key={opt.tz}
                    className="inline-flex items-center gap-2"
                  >
                    <input
                      type="radio"
                      name="tz_choice"
                      checked={
                        tzRes.options.find(
                          (o) =>
                            o.transitId === tzDisambigTransitId &&
                            o.side === tzDisambigSide,
                        )?.tz === opt.tz
                      }
                      onChange={() => selectTz(opt)}
                    />
                    <span>{tzDisplayLabel(opt.tz)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {/* メモは公開範囲などの設定オプションより上に置く（費用フォームと並びを統一）。 */}
      <Input
        type="text"
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("memo")}
        aria-label={t("memo")}
        className="block w-full min-w-0"
      />

      {/* 公開範囲 と 要予約 を同一行に左詰め＋縦区切り線で同居（1行節約）。両者は無関係な
          設定なので、付属物に見えないよう区切り線で「別グループ」と示す。要予約は公開範囲に
          依らず常に出す（private 予定でも予約は要る）。ON で予約TODOが紐づき、その可視範囲は
          予定の公開範囲を継承する（private→作成者だけに見える）。 */}
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{t("visibility")}</span>
          {canChangeVis ? (
            <div className="flex gap-3" role="radiogroup" aria-label={t("visibility")}>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="visibility"
                  value="shared"
                  checked={visibility === "shared"}
                  onChange={() => setVisibility("shared")}
                />
                <span>{t("visibilityShared")}</span>
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === "private"}
                  onChange={() => setVisibility("private")}
                />
                <span>{t("visibilitySelfOnly")}</span>
              </label>
            </div>
          ) : (
            <>
              <span className="text-muted-foreground">
                {visibility === "shared" ? t("visibilityShared") : t("visibilitySelfOnly")}
              </span>
              <input type="hidden" name="visibility" value={visibility} />
            </>
          )}
        </div>
        <InlineDivider className="h-4" />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="needs_reservation"
            checked={needsReservation}
            onChange={(e) => setNeedsReservation(e.target.checked)}
          />
          <FieldLabel>{t("needsReservation")}</FieldLabel>
        </label>
      </div>

      {/* 参加者。共有予定のみ意味がある（private は作成者本人だけが当事者なので
          省略）。デフォルトは「参加者: 全員」＋下向きシェブロンの disclosure。タップで展開して
          チップで選択できるようになる。展開状態は「参加者: 一部」＋上向きシェブロンで、再
          タップでチップを畳んで全員に戻す。送信は pMode=custom の時だけ hidden
          input を生やし、それ以外は何も送らない（=全員のシュガー）。 */}
      {visibility === "shared" && members.length > 1 && (
        <div className="text-sm">
          <button
            type="button"
            onClick={() => {
              if (pMode === "all") {
                setPMode("custom");
              } else {
                setPMode("all");
                setPSelected(new Set(members.map((m) => m.id)));
              }
            }}
            aria-expanded={pMode === "custom"}
            className="inline-flex items-center gap-1 rounded font-medium text-muted-foreground transition hover:text-foreground"
          >
            <span>{t("participants")}: {pMode === "all" ? t("participantsAll") : t("participantsSome")}</span>
            <ChevronIcon
              size={16}
              className={`transition-transform ${pMode === "all" ? "rotate-90" : "-rotate-90"}`}
            />
          </button>
          {pMode === "custom" && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {members.map((m) => {
                const on = pSelected.has(m.id);
                return (
                  <ToggleChip
                    key={m.id}
                    on={on}
                    hue={m.color}
                    onClick={() => toggleParticipant(m.id)}
                  >
                    {m.display_name}
                  </ToggleChip>
                );
              })}
            </div>
          )}
          {pMode === "custom" &&
            Array.from(pSelected).map((id) => (
              <input
                key={id}
                type="hidden"
                name="participant_member_ids"
                value={id}
              />
            ))}
        </div>
      )}

      <div className="flex gap-2">
        {/* 取り込み下書きの破棄（新規＝確定フローの時だけ）。編集時の削除と
            同じ位置・同じ形で、どちらか一方しか出ない。 */}
        {!isEdit && onDismissDraft && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={onDismissDraft}
            aria-label={tImport("dismiss")}
            title={tImport("dismiss")}
            className="shrink-0"
          >
            <TrashIcon size={18} />
          </Button>
        )}
        {isEdit && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={onDelete}
            disabled={isDeleting}
            aria-label={tCommon("delete")}
            title={tCommon("delete")}
            className="shrink-0"
          >
            <TrashIcon size={18} />
          </Button>
        )}
        <SubmitButton
          busy={isPending}
          // 必須（タイトル）は * でなく「埋まるまで送信無効」で表現（iOS 方式）。
          disabled={!title.trim()}
          aria-label={isEdit ? tCommon("save") : tCommon("add")}
          title={isEdit ? tCommon("save") : tCommon("add")}
          className="flex-1"
        >
          {isEdit ? <SaveIcon size={20} /> : <PlusIcon size={20} />}
        </SubmitButton>
      </div>

      {state.error && (
        <MessageBox kind="error" dense>
          {state.error}
        </MessageBox>
      )}
    </form>
  );
}
