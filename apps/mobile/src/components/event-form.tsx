import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import type { PlaceInput } from "@triplot/shared/data/place";
import { type Flight, flightTerminalNote, flightTitle } from "@triplot/shared/flight";
import {
  crossesTimezone,
  deriveTransitTimezones,
} from "@triplot/shared/placeTimezone";
import {
  createEvent,
  deleteEvent,
  updateEvent,
  type EventFields,
} from "@triplot/shared/data/events";
import {
  buildTripTzTimeline,
  dedupeTzCandidates,
  resolveExpenseTz,
  type TzCandidate,
} from "@triplot/shared/schedule";
import type { EventDraftItem } from "@triplot/shared/import/drafts";
import type { EventRow } from "@triplot/shared/tripDerive";
import { tzDisplayLabel } from "@triplot/shared/timezones";
import type { Visibility } from "@triplot/shared/types/database";
import { resolveAirportPlace, type PlaceCandidate } from "@triplot/shared/placesSearch";

import {
  chipDateText,
  chipDateTimeText,
  chipEndTimeText,
  InlineNativePicker,
  PickerChip,
} from "./datetime-field";
import { PlacePicker } from "./place-picker";
import { SheetTitle } from "./sheet-title";
import { TimezonePicker } from "./timezone-picker";
import { ToggleChip } from "./toggle-chip";
import { CompactSegment, VisibilitySegment } from "./visibility-segment";
import { PlusIcon, SaveIcon, TrashIcon, ChevronIcon, PlaneIcon } from "./icons";
import { FlightPicker } from "./flight-picker";
import { BUNDLE_ID, PLACES_API_KEY } from "@/lib/googlePlaces";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

type Member = { id: string; display_name: string; color: number | null };
type Kind3 = "timed" | "allday" | "transit";

// 予定フォーム（RN）。web の event-form.tsx と同じ3種別（通常/終日/時差移動）・
// 同じ導出。検証後 shared の createEvent/updateEvent/deleteEvent を呼ぶ。
export function EventForm({
  tripId,
  members,
  myMemberId,
  places,
  biasCenter,
  tripStart,
  defaultTimezone,
  events,
  editEvent,
  draft,
  slot,
  onDone,
  onSuccess,
  onDismissDraft,
}: {
  tripId: string;
  members: Member[];
  myMemberId: string;
  // lat/lng は移動の TZ を場所から導出するのに使う（placeTimezone.ts）。
  places: { id: string; name: string; lat: number | null; lng: number | null }[];
  // 場所欄の Google サジェストの地理バイアス（旅行の既存ピンの重心）。
  biasCenter?: { lat: number; lng: number };
  tripStart: string | null;
  defaultTimezone: string | null;
  events: EventRow[];
  editEvent?: EventRow;
  // メール取り込みの未確定下書きの確定フロー。create モードの事前入力として
  // 使う（editEvent と排他）。確定処理自体は onSuccess 側（呼び出し元）。
  draft?: EventDraftItem;
  // 週カレンダーの空き枠長押しからの事前入力（開始日時。iOS カレンダー流）。
  slot?: { date: string; time: string };
  onDone: () => void;
  // 追加/更新が成功したときだけ呼ぶ（キャンセルでは呼ばれない）。追加成功時は
  // 作成した予定の id が渡る（取り込み下書きの確定リンクに使う）。
  onSuccess?: (eventId?: string) => void;
  // 下書き確定モード（draft 指定時）だけ渡る: この下書きを破棄する
  // （費用タブの「破棄」と同じ resolveInboundDraft(..., "dismissed")）。
  onDismissDraft?: () => void;
}) {
  const t = useTranslations("event");
  const tImport = useTranslations("import");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isEdit = !!editEvent;
  const prefill = draft?.prefill ?? null;

  const tzTimeline = useMemo(
    () => buildTripTzTimeline(events, defaultTimezone),
    [events, defaultTimezone],
  );

  const initKind: Kind3 = editEvent
    ? editEvent.kind === "transit"
      ? "transit"
      : editEvent.allDay
        ? "allday"
        : "timed"
    : (prefill?.kind3 ?? "timed");
  // 種別は3択セグメントで宣言させず、独立した2トグル（終日／移動）から導出する。
  // ユーザーは「これは移動か？」には答えられるが「これは時差移動か？」では
  // 考え込む。DB 制約上 transit は all_day 不可なので UI でも排他にする。
  const [allDayOn, setAllDayOn] = useState(initKind === "allday");
  const [moveOn, setMoveOn] = useState(initKind === "transit");
  const kind: Kind3 = allDayOn ? "allday" : moveOn ? "transit" : "timed";

  const [title, setTitle] = useState(editEvent?.title ?? prefill?.title ?? "");
  const [note, setNote] = useState(editEvent?.note ?? prefill?.note ?? "");
  const [visibility, setVisibility] = useState<Visibility>(
    editEvent?.visibility ?? "shared",
  );
  const [needsReservation, setNeedsReservation] = useState(
    editEvent?.needsReservation ?? false,
  );
  // 下書きの place/endPlace（保存済みマッチ or 事前解決済みフライトの
  // 座標つき自由入力）を PlaceInput に変換する。両方の場所欄で共通。
  const draftPlaceToInput = (p: NonNullable<typeof prefill>["place"]): PlaceInput | null => {
    if (!p) return null;
    if (p.kind === "saved") return { kind: "saved", placeId: p.id };
    if (p.kind === "google") {
      return {
        kind: "google",
        placeId: p.placeId,
        name: p.name,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        region: p.region,
        locality: p.locality,
        icon: p.icon,
      };
    }
    return {
      kind: "free",
      label: p.name,
      coords: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null,
      icon: "airport",
    };
  };
  const [place, setPlace] = useState<PlaceInput>(() => {
    if (editEvent) return { kind: "saved", placeId: editEvent.startPlaceId };
    // 下書き: 保存済みマッチ／事前解決済みフライトの空港はそれを、無ければ
    // 抽出した場所名を自由入力テキストとして事前入力（RN は Google 自動解決を
    // 持たないので web の低確信時と同じ自由入力フォールバック）。
    const fromPrefill = draftPlaceToInput(prefill?.place ?? null);
    if (fromPrefill) return fromPrefill;
    if (prefill?.autoResolvePlace)
      return { kind: "free", label: prefill.autoResolvePlace.name };
    return { kind: "saved", placeId: null };
  });
  // 到着地。空（placeId=null）なら DB 側で end_place_id は NULL＝出発地と同じ。
  // 事前解決済みフライトがあれば到着空港を事前入力する。
  const [endPlace, setEndPlace] = useState<PlaceInput>(() => {
    if (editEvent) return { kind: "saved", placeId: editEvent.endPlaceId };
    return draftPlaceToInput(prefill?.endPlace ?? null) ?? { kind: "saved", placeId: null };
  });

  // 日時。start/end は "YYYY-MM-DD" と "HH:MM"。
  const initDate =
    editEvent?.startAt.slice(0, 10) ??
    draft?.date ??
    slot?.date ??
    tripStart ??
    today();
  const initTime =
    editEvent?.startAt.slice(11, 16) ?? draft?.time ?? slot?.time ?? "09:00";
  const [startDate, setStartDate] = useState(initDate);
  const [startTime, setStartTime] = useState(initTime);
  const initEndDate =
    editEvent?.endAt?.slice(0, 10) ?? prefill?.endDate ?? initDate;
  const initEndTime =
    editEvent?.endAt?.slice(11, 16) ?? prefill?.endTime ?? addHour(initTime);
  const [endDate, setEndDate] = useState(initEndDate);
  const [endTime, setEndTime] = useState(initEndTime);
  // inline ピッカーの開閉（同時に開くのは1つだけ）。
  const [openPicker, setOpenPicker] = useState<"start" | "end" | null>(null);

  // 時差移動の出発/到着TZ。
  // TZ は場所の座標から導出するのが既定（3段ネストのピッカーを触らせない）。
  // 座標を持たない場所（自由入力＝地図未登録）では導出できないので、その時だけ
  // 保存済みの値／旅行の既定に落として、ユーザーが明示的に選べるようにする。
  const [tzOverride, setTzOverride] = useState<{
    start: string | null;
    end: string | null;
  }>({ start: null, end: null });
  const [tzExpanded, setTzExpanded] = useState(false);

  // タイトル欄をフライト番号入力に入れ替えているか。
  // メール取り込み下書きの確定で、便名がフライトとして解釈できていれば
  // 最初からフライト番号機能で開く（打ち直させない。手入力と同じ経路を
  // 通るので、確定後の結果は手動でフライト番号を打った時と区別が付かない）。
  const [flightMode, setFlightMode] = useState(() => !!prefill?.flightNumber);
  // 下書き由来で自動起動した最初の1回だけ、見つかった便をタップ無しで
  // 即確定する（便名は予約メールに書かれていた実在の値なので手打ちの
  // ような打ち間違いのリスクが無い）。ユーザーが飛行機アイコンから
  // 手動で開き直した場合は false のまま＝通常どおりタップして確定する。
  const [autoApplyFlight, setAutoApplyFlight] = useState(
    () => !!prefill?.flightNumber,
  );

  /**
   * プレビューで確定したフライトをフォームに流し込む。
   *
   * 空港は**座標つきの自由入力**として渡す（Google 由来ではないので place spec の
   * freetext 枝。座標があるので地図にピンが立つ）。TZ は提供元が IANA を返すので
   * それを使い、返らなければ座標からの導出（derivedTz）に任せて上書きしない。
   */
  const applyFlight = (f: Flight) => {
    setAutoApplyFlight(false);
    setTitle(flightTitle(f));
    setMoveOn(true);
    setAllDayOn(false);
    // 出発/到着どちらかのターミナルがわかればメモに書く（片方欠けは "--"）。
    // 両方とも不明なときだけメモは触らない。既存のメモ（下書き確定時の
    // 予約番号など）は上書きせず残す（メモ内の区切りは deriveEventDraftItems
    // と同じ " ・ "。メモ欄は1行入力なので改行では繋がない）。
    const terminalNote = flightTerminalNote(f);
    if (terminalNote) {
      setNote((prev) =>
        prev.trim() ? `${prev} ・ ${terminalNote}` : terminalNote,
      );
    }

    const asPlace = (e: Flight["departure"]): PlaceInput => ({
      kind: "free",
      label: e.name,
      coords: e.lat !== null && e.lng !== null ? { lat: e.lat, lng: e.lng } : null,
      icon: "airport",
    });
    setPlace(asPlace(f.departure));
    setEndPlace(asPlace(f.arrival));

    // 裏で Google の場所として解決を試みる（メール取り込みの事前解決
    // 〔prefetchFlights〕と同じ考え方）。見つかれば座標つき自由入力から
    // Google の場所に差し替え、表記違い（"Tokyo Narita" / "成田国際空港"）
    // での重複登録を避ける。見つからなければ何もしない（座標つき自由入力の
    // まま＝機能の前提ではなく表示上の改善）。
    if (PLACES_API_KEY) {
      const asGooglePlace = (c: PlaceCandidate): PlaceInput => ({
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
      void (async () => {
        const [dep, arr] = await Promise.all([
          resolveAirportPlace(f.departure, {
            apiKey: PLACES_API_KEY,
            iosBundleId: BUNDLE_ID,
          }),
          resolveAirportPlace(f.arrival, {
            apiKey: PLACES_API_KEY,
            iosBundleId: BUNDLE_ID,
          }),
        ]);
        if (dep) setPlace(asGooglePlace(dep));
        if (arr) setEndPlace(asGooglePlace(arr));
      })();
    }

    if (f.departure.scheduledLocal) {
      setStartDate(f.departure.scheduledLocal.slice(0, 10));
      setStartTime(f.departure.scheduledLocal.slice(11, 16));
    }
    if (f.arrival.scheduledLocal) {
      setEndDate(f.arrival.scheduledLocal.slice(0, 10));
      setEndTime(f.arrival.scheduledLocal.slice(11, 16));
    }
    // TZ は**座標から導出できるなら上書きしない**。上書き（tzOverride）は
    // 「ユーザーが明示的に選んだ」の意味で、ここで埋めると後から場所を直しても
    // 古い TZ が残る。空港の座標があれば導出が同じ答えを出す（tz-lookup）ので、
    // 座標が無い端点だけ提供元の IANA を明示値として入れる。
    setTzOverride({
      start: f.departure.lat === null ? f.departure.timeZone : null,
      end: f.arrival.lat === null ? f.arrival.timeZone : null,
    });

    setFlightMode(false);
  };

  const coordsOf = (p: PlaceInput): { lat: number | null; lng: number | null } => {
    if (p.kind === "google") return { lat: p.lat, lng: p.lng };
    // 自由入力でも座標を持つことがある（フライトから入れた空港）。
    if (p.kind === "free" && p.coords) return p.coords;
    if (p.kind === "saved" && p.placeId) {
      const hit = places.find((x) => x.id === p.placeId);
      return { lat: hit?.lat ?? null, lng: hit?.lng ?? null };
    }
    return { lat: null, lng: null };
  };

  const derivedTz = deriveTransitTimezones(
    coordsOf(place),
    endPlace.kind === "saved" && !endPlace.placeId ? null : coordsOf(endPlace),
  );
  const departTz =
    tzOverride.start ??
    derivedTz.startTz ??
    editEvent?.startTz ??
    prefill?.departTz ??
    defaultTimezone ??
    "Asia/Tokyo";
  const arriveTz =
    tzOverride.end ??
    derivedTz.endTz ??
    editEvent?.endTz ??
    prefill?.arriveTz ??
    departTz;
  const setDepartTz = (tz: string) =>
    setTzOverride((o) => ({ ...o, start: tz }));
  const setArriveTz = (tz: string) => setTzOverride((o) => ({ ...o, end: tz }));


  const initResolution = resolveExpenseTz(initDate, tzTimeline);
  const [tzDisambigTransitId, setTzDisambigTransitId] = useState<string | null>(
    editEvent?.tzDisambigTransitId ??
      (initResolution.kind === "ambiguous"
        ? initResolution.options[0].transitId
        : null),
  );
  const [tzDisambigSide, setTzDisambigSide] = useState<
    "depart" | "arrive" | null
  >(
    editEvent?.tzDisambigSide ??
      (initResolution.kind === "ambiguous"
        ? initResolution.options[0].side
        : null),
  );
  const startTzRes = useMemo(
    () => resolveExpenseTz(startDate, tzTimeline),
    [startDate, tzTimeline],
  );
  const multiTz = tzTimeline.transits.length > 0;
  const selectTz = (c: TzCandidate) => {
    setTzDisambigTransitId(c.transitId);
    setTzDisambigSide(c.side);
  };
  const onStartDateChange = (nd: string) => {
    setStartDate(nd);
    const r = resolveExpenseTz(nd, tzTimeline);
    if (r.kind === "single") {
      setTzDisambigTransitId(null);
      setTzDisambigSide(null);
    } else {
      selectTz(r.options[0]);
    }
  };

  // 通常予定: 開始を動かすと長さ（日付込み）を保って終了が追従する（web の
  // moveStart と同じ）。TZ の再解決は日付が実際に変わったときだけ — 時刻だけの
  // 調整で毎回呼び直すと、乗継日で手動選択した側が黙って既定に巻き戻るため。
  const moveStart = (d: Date) => {
    const nd = fmtDate(d);
    const nt = fmtTime(d);
    const dur = Math.max(
      Date.parse(`${endDate}T${endTime}:00`) -
        Date.parse(`${startDate}T${startTime}:00`),
      3_600_000,
    );
    if (nd !== startDate) {
      onStartDateChange(nd);
    }
    setStartTime(nt);
    const ne = new Date(Date.parse(`${nd}T${nt}:00`) + dur);
    setEndDate(fmtDate(ne));
    setEndTime(fmtTime(ne));
  };

  // 通常予定の終了ガード: 終了 ≤ 開始になったら開始+1時間に snap（web と同じ）。
  // 移動の出発をずらす。到着は同じ差分だけ動かして所要時間を保つ。
  // 通常予定（moveStart）は「開始→終了の長さ」を保つが、移動は出発と到着で
  // TZ が違うので長さを ms で測れない。壁時計に同じ差分を足す形にすると、
  // 実所要時間が保たれる（TZ の差は両端で不変なため）。
  const moveTransitStart = (d: Date) => {
    const nd = fmtDate(d);
    const nt = fmtTime(d);
    const deltaMs =
      Date.parse(`${nd}T${nt}:00`) - Date.parse(`${startDate}T${startTime}:00`);
    onStartDateChange(nd);
    setStartTime(nt);
    if (deltaMs !== 0) {
      const ne = new Date(Date.parse(`${endDate}T${endTime}:00`) + deltaMs);
      setEndDate(fmtDate(ne));
      setEndTime(fmtTime(ne));
    }
  };

  const setEndGuarded = (d: Date) => {
    const sMs = Date.parse(`${startDate}T${startTime}:00`);
    const e = d.getTime() <= sMs ? new Date(sMs + 3_600_000) : d;
    setEndDate(fmtDate(e));
    setEndTime(fmtTime(e));
  };

  // 終日の開始ガード: 開始を終了より後にしたら単日扱いで終了も揃える（web と
  // 同じ。終了側は minimumDate で開始以前を選べないため逆方向のみケア）。
  const moveAlldayStart = (nd: string) => {
    onStartDateChange(nd);
    if (nd > endDate) setEndDate(nd);
  };

  // 参加者（全員 / 一部）。
  const initCustom = isEdit && (editEvent?.participantMemberIds.length ?? 0) > 0;
  const [partMode, setPartMode] = useState<"all" | "custom">(
    initCustom ? "custom" : "all",
  );
  const [participants, setParticipants] = useState<Set<string>>(
    () => new Set(editEvent?.participantMemberIds ?? []),
  );
  const toggleParticipant = (id: string) => {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canDelete =
    isEdit &&
    (editEvent!.visibility === "private"
      ? editEvent!.createdByMemberId === myMemberId
      : true);

  // 公開範囲を変えられるのは作成者だけ（web の canChangeVisibility と同じ）。
  // 他人の共有予定を private にできてしまうと、その人にも見えなくなる。
  const canChangeVisibility =
    !isEdit || editEvent!.createdByMemberId === myMemberId;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) {
      setError(`${t("title")}?`);
      return;
    }
    setBusy(true);
    setError(null);

    const allDay = kind === "allday";
    // 「移動」でも出発地と到着地で時差が無ければ通常予定として保存する。
    // 旅程の TZ 境界（transit）は時差があるときだけ意味を持つので、東京→大阪で
    // 無意味な境界を増やさない。ユーザーには種別の違いを見せない。
    const isBoundary = kind === "transit" && crossesTimezone(departTz, arriveTz);
    const submitKind = isBoundary ? "transit" : "normal";
    // 参加者: all は空配列（web と同じシュガー）、custom は選択分。
    const participantIds =
      partMode === "all" ? [] : Array.from(participants);

    let startAt: string;
    let endAt: string | null;
    let startTz: string | null = null;
    let endTz: string | null = null;
    if (kind === "allday") {
      startAt = `${startDate}T00:00`;
      endAt = `${endDate}T00:00`;
    } else if (isBoundary) {
      startAt = `${startDate}T${startTime}`;
      endAt = `${endDate}T${endTime}`;
      startTz = departTz;
      endTz = arriveTz;
    } else {
      startAt = `${startDate}T${startTime}`;
      endAt = `${endDate}T${endTime}`;
    }

    const fields: EventFields = {
      kind: submitKind,
      allDay,
      title: title.trim(),
      startAt,
      endAt,
      startTz,
      endTz,
      // 通常/終日の乗継日曖昧解決（transit は自身のTZを持つので null）。
      // 移動（TZ境界）は自身の実TZを持つので不要。終日も TZ を使わないので持たない。
      tzDisambigTransitId: isBoundary || allDay ? null : tzDisambigTransitId,
      tzDisambigSide: isBoundary || allDay ? null : tzDisambigSide,
      visibility,
      note: note.trim(),
      participantMemberIds: participantIds,
      startPlace: place,
      // 移動でなければ到着地は持たない（＝出発地と同じ）。
      endPlace: kind === "transit" ? endPlace : null,
    };

    if (isEdit) {
      const result = await updateEvent(
        supabase,
        editEvent!.id,
        fields,
        needsReservation,
      );
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    } else {
      const result = await createEvent(supabase, tripId, fields, needsReservation);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // 作成した予定の id を渡す（取り込み下書きの確定リンクに使う）。
      onSuccess?.(result.data);
    }
    onDone();
  };

  const onDelete = () => {
    if (!editEvent) return;
    Alert.alert(t("deleteTitle"), undefined, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          void deleteEvent(supabase, editEvent.id).then((r) => {
            if (!r.ok) {
              Alert.alert(t("deleteFailed", { error: r.error }));
              return;
            }
            onDone();
          });
        },
      },
    ]);
  };

  const isTransit = kind === "transit";

  return (
    <View style={styles.content}>
      {/* シート先頭のタイトル。formSheet はナビヘッダーを出さないので、これで
          グラバー/コーナーぶんの余白を確保する（無いと種別セグメントがコーナーの
          丸みに食い込んでタップが拾われないことがある）。 */}
      <SheetTitle>{isEdit ? t("editFormLabel") : t("addAria")}</SheetTitle>


      {/* タイトル: ラベル無し＋placeholder＝フィールド名（iOS カレンダー方式）。
          右端の飛行機アイコンで**この行がフライト番号入力に入れ替わる**。
          専用の行を足すとフォームが縦に伸びるので、入れ替えにしている。
          アイコンは入力欄の内側右端に重ねる（iOS 標準の検索欄のマイクと同じ形。
          web の title 行と同じ見た目に揃える）。 */}
      {flightMode ? (
        <FlightPicker
          date={startDate}
          initialNumber={prefill?.flightNumber ?? undefined}
          autoApply={autoApplyFlight}
          onCancel={() => {
            setAutoApplyFlight(false);
            setFlightMode(false);
          }}
          onApply={applyFlight}
        />
      ) : (
        <View style={styles.titleRow}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t("title")}
            accessibilityLabel={t("title")}
            placeholderTextColor={theme.subtleForeground}
            style={[styles.input, styles.titleInput]}
          />
          <Pressable
            onPress={() => {
              setAutoApplyFlight(false);
              setFlightMode(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            style={styles.titleAction}
            accessibilityLabel={t("flightAria")}
          >
            <PlaneIcon size={20} color={theme.foreground} />
          </Pressable>
        </View>
      )}

      {/* 種別は宣言させず、入力の結果として決まる。移動は「出す欄」を変える
          （到着地・TZ）ので場所より前に置く。終日は日時の見た目だけ変えるので
          日時の行に置く。
          排他は非対称にする。**移動 ON → 終日を消す**（移動では終日があり得ない）。
          **終日 ON → 移動は残して無効化**。移動は「どの欄が存在するか」を決める
          上位の切り替えで、日時行の下位オプションである終日を触ったせいで画面から
          消えるのは筋が悪い。加えて、終日スイッチより上の行が消えると再配置が走って
          スイッチのアニメーションが潰れる（実機フィードバック）。 */}
      <View style={styles.optionPair}>
        <Text style={styles.label}>{t("kindMove")}</Text>
        <Switch value={moveOn} disabled={allDayOn} onValueChange={setMoveOn} />
      </View>

      <PlacePicker
        places={places}
        biasCenter={biasCenter}
        value={place}
        onChange={setPlace}
        placeholder={isTransit ? t("startPlace") : t("place")}
      />

      {/* 移動: 到着地とタイムゾーン。TZ は場所の座標から自動で決まるので、
          既定では結果を1行見せるだけ（3段ネストのピッカーを触らせない）。
          座標が無くて決められないときと、ユーザーが変えたいときだけ開く。 */}
      {isTransit && (
        <>
          <PlacePicker
            places={places}
            biasCenter={biasCenter}
            value={endPlace}
            onChange={setEndPlace}
            placeholder={t("endPlace")}
          />
          {/* **自動では開かない。** 「決められないときだけ開く」にすると、
              出発地が空の初期状態がまさにそれに当たり、入力していくと編集欄が
              消えるという逆向きの挙動になる（実機フィードバック）。常に1行の
              行を出し、押したときだけピッカーを開く。
              **開いたら閉じられる**（開閉行は往復できるのが普通）。重複を避ける
              ため、開いている間は値を出さない（値はピッカー側に見えている）。 */}
          <Pressable
            style={styles.optionPair}
            onPress={() => setTzExpanded((v) => !v)}
            accessibilityLabel={t("timezone")}
          >
            <Text style={styles.label}>{t("timezone")}</Text>
            <View style={styles.tzSummaryRow}>
              {!tzExpanded && (
                <Text style={styles.tzSummary}>
                  {tzDisplayLabel(departTz)} → {tzDisplayLabel(arriveTz)}
                </Text>
              )}
              <View style={tzExpanded ? styles.chevronOpen : undefined}>
                <ChevronIcon size={16} color={theme.mutedForeground} />
              </View>
            </View>
          </Pressable>
          {tzExpanded && (
            <View style={styles.tzRow}>
              <View style={styles.tzCol}>
                <Text style={styles.label}>{t("departTz")}</Text>
                <TimezonePicker value={departTz} onChange={setDepartTz} />
              </View>
              <View style={styles.tzCol}>
                <Text style={styles.label}>{t("arriveTz")}</Text>
                <TimezonePicker value={arriveTz} onChange={setArriveTz} />
              </View>
            </View>
          )}
        </>
      )}


      <View style={styles.dtGroup}>
        {/* ラベル・日時チップ・終日を1行に。終日は「日時の見せ方」を変える
            コントロールなので日時の隣にあるのが自然。入り切らない端末/文字サイズ
            では flexWrap で折り返し、その場合は従来どおりの2行になる。 */}
        <View style={styles.dtRow}>
          <Text style={styles.label}>
            {kind === "allday" ? t("date") : t("dateTime")}
          </Text>
          <View style={styles.dtChipsRow}>
            <PickerChip
              text={
                kind === "allday"
                  ? chipDateText(startDate)
                  : chipDateTimeText(startDate, startTime)
              }
              active={openPicker === "start"}
              onPress={() =>
                setOpenPicker((p) => (p === "start" ? null : "start"))
              }
            />
            <Text style={styles.dtSep}>–</Text>
            <PickerChip
              text={
                kind === "allday"
                  ? chipDateText(endDate)
                  : chipEndTimeText(startDate, endDate, endTime)
              }
              active={openPicker === "end"}
              onPress={() => setOpenPicker((p) => (p === "end" ? null : "end"))}
            />
          </View>
          {!moveOn && (
            <View style={styles.dtAllDay}>
              <Text style={styles.label}>{t("kindAllday")}</Text>
              <Switch value={allDayOn} onValueChange={setAllDayOn} />
            </View>
          )}
        </View>
        {/* 開始/終了でピッカーを1つ共有（出し分けると切替時にネイティブ
            ピッカーが作り直されて一瞬ちらつくため。datetime-field の注意書き）。 */}
        {openPicker != null && (
          <InlineNativePicker
            value={
              openPicker === "start"
                ? new Date(`${startDate}T${kind === "allday" ? "12:00" : startTime}:00`)
                : new Date(`${endDate}T${kind === "allday" ? "12:00" : endTime}:00`)
            }
            mode={kind === "allday" ? "date" : "datetime"}
            minimumDate={
              openPicker === "end" && kind === "allday"
                ? new Date(`${startDate}T12:00:00`)
                : undefined
            }
            onChange={(d) => {
              if (openPicker === "start") {
                if (kind === "allday") {
                  // 他のピッカーと同じく、選んだだけでは閉じない（閉じるのは
                  // もう一度チップを押したとき）。終日だけ自動で閉じると
                  // 挙動が不揃いになる。
                  moveAlldayStart(fmtDate(d));
                } else if (kind === "transit") {
                  // 移動も通常予定と同じく、出発をずらしたら到着が同じ幅だけ
                  // 追従する（所要時間は変わらないため）。出発と到着でTZが
                  // 違っても、壁時計に同じ差分を足せば所要時間は保たれる。
                  moveTransitStart(d);
                } else {
                  moveStart(d);
                }
              } else {
                if (kind === "allday") {
                  setEndDate(fmtDate(d));
                } else if (kind === "transit") {
                  setEndDate(fmtDate(d));
                  setEndTime(fmtTime(d));
                } else {
                  setEndGuarded(d);
                }
              }
            }}
          />
        )}
      </View>

      {/* 通常/終日: 乗継日のTZ曖昧解決（セグメント）。同じ TZ の候補は
          dedupeTzCandidates で1つに畳み、キーも TZ で照合する（選択の実体は
          transitId/side だが、ユーザにとっての選択単位は TZ のため）。 */}
      {/* 終日は出さない。終日は日付そのもので時刻を持たず、実効TZが要る場面が
          無いため（週カレンダーの終日帯は日付だけで列を決め、Google カレンダー
          出力も date のみで tz を使わない）。乗継日に TZ を選ばせても、
          どこにも使われない入力になる。 */}
      {kind === "timed" &&
        multiTz &&
        startTzRes.kind === "ambiguous" && (
          <View>
            <Text style={styles.hint}>{t("transitDay")}</Text>
            <View style={styles.tzOptions}>
              <CompactSegment
                options={dedupeTzCandidates(startTzRes.options).map((opt) => ({
                  key: opt.tz,
                  label: tzDisplayLabel(opt.tz),
                }))}
                value={
                  startTzRes.options.find(
                    (o) =>
                      o.transitId === tzDisambigTransitId &&
                      o.side === tzDisambigSide,
                  )?.tz ?? ""
                }
                onChange={(tz) => {
                  const opt = startTzRes.options.find((o) => o.tz === tz);
                  if (opt) selectTz(opt);
                }}
              />
            </View>
          </View>
        )}

      {/* 場所 */}
      {/* メモ */}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t("memo")}
        accessibilityLabel={t("memo")}
        placeholderTextColor={theme.subtleForeground}
        style={styles.input}
      />

      {/* 公開範囲（セグメント）と要予約（スイッチ）を1行に同居（web と同じ1行節約）。 */}
      <View style={styles.optionsRow}>
        <View style={styles.optionPair}>
          <Text style={styles.label}>{t("visibility")}</Text>
          <VisibilitySegment
            value={visibility}
            onChange={setVisibility}
            readOnly={!canChangeVisibility}
          />
        </View>
        <View style={styles.optionPair}>
          <Text style={styles.label}>{t("needsReservation")}</Text>
          <Switch
            value={needsReservation}
            onValueChange={setNeedsReservation}
          />
        </View>
      </View>

      {/* 参加者（複数メンバーのときだけ） */}
      {members.length > 1 && (
        <View>
          <Pressable
            onPress={() => {
              setPartMode((m) => (m === "all" ? "custom" : "all"));
              if (partMode === "all")
                setParticipants(new Set([myMemberId]));
            }}
            style={styles.disclosure}
          >
            <Text style={styles.disclosureLabel}>
              {t("participants")}:{" "}
              {partMode === "all" ? t("participantsAll") : t("participantsSome")}
            </Text>
          </Pressable>
          {partMode === "custom" && (
            <View style={styles.chipWrap}>
              {members.map((m) => (
                <ToggleChip
                  key={m.id}
                  on={participants.has(m.id)}
                  hue={m.color}
                  label={m.display_name}
                  onPress={() => toggleParticipant(m.id)}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* フッター */}
      <View style={styles.footer}>
        {canDelete && (
          <Pressable
            onPress={onDelete}
            style={styles.deleteButton}
            accessibilityLabel="削除"
          >
            <TrashIcon size={18} color={theme.destructiveText} />
          </Pressable>
        )}
        {!isEdit && draft && onDismissDraft && (
          <Pressable
            onPress={onDismissDraft}
            style={styles.deleteButton}
            accessibilityLabel={tImport("dismiss")}
          >
            <TrashIcon size={18} color={theme.destructiveText} />
          </Pressable>
        )}
        <Pressable
          onPress={() => void submit()}
          // 必須（タイトル）は * でなく「埋まるまで送信無効」で表現（iOS 方式）。
          disabled={busy || !title.trim()}
          accessibilityLabel={isEdit ? "保存" : "追加"}
          style={[
            styles.submitButton,
            (busy || !title.trim()) && styles.disabled,
          ]}
        >
          {isEdit ? (
            <SaveIcon size={20} color={theme.primaryForeground} />
          ) : (
            <PlusIcon size={20} color={theme.primaryForeground} />
          )}
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const nh = (h + 1) % 24;
  return `${String(nh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // 上端は SheetTitle 側の paddingTop（グラバー/コーナー分の余白）に任せる。
    content: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
    segment: {
      flexDirection: "row",
      gap: 4,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.1),
      borderRadius: 6,
      padding: 4,
    },
    segItem: {
      flex: 1,
      borderRadius: 4,
      paddingVertical: 6,
      alignItems: "center",
    },
    segItemOn: { backgroundColor: t.primary },
    segText: { fontSize: 12, fontWeight: "500", color: t.mutedForeground },
    segTextOn: { color: t.primaryForeground },
    hint: { fontSize: 12, color: t.mutedForeground },
    label: {
      fontSize: 13,
      fontWeight: "500",
      marginBottom: 4,
      color: t.foreground,
    },
    input: {
      height: 36,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 10,
      fontSize: 14,
      color: t.foreground,
    },
    // タイトル行。右端の飛行機アイコンは入力欄の内側に重ねる（TextInput 自体の
    // 子要素にはせず、position:absolute で兄弟要素として重ねる — カーソル計算は
    // TextInput が自分のテキストだけで行うので影響を受けない）。
    titleRow: { position: "relative" },
    titleInput: { paddingRight: 40 },
    titleAction: {
      position: "absolute",
      // アイコンを 16→20pt に拡大した際、箱(28)の中で占める割合が増えて
      // 右の余白が視覚的に詰まって見えていた（実機フィードバック）。
      // 入力欄の左パディング（input.paddingHorizontal 10）と揃うよう
      // right を調整（箱の中央にアイコンがある前提の逆算: 10 - (28-20)/2）。
      right: 6,
      top: 4,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    // 日時ブロック（ラベル行＋「開始 – 終了」チップ1行。web と同形）。
    dtGroup: {},
    dtChipsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dtSep: { fontSize: 14, color: t.subtleForeground },
    // 時差移動の出発/到着TZ（1行2列。web と同じ）。
    dtRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  // 終日 ON では日時チップが短くなるので、marginLeft:auto で右端に固定する。
  dtAllDay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
  },
  chevronOpen: { transform: [{ rotate: "90deg" }] },
  tzSummaryRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  tzSummary: { fontSize: 14, color: t.mutedForeground },
  tzRow: { flexDirection: "row", gap: 8 },
    tzCol: { flex: 1, minWidth: 0 },
    // TZ曖昧解決のラジオは横並び（web と同じ。縦積みだと4行で場所を食う）。
    tzOptions: {
      marginTop: 6,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    // 公開範囲＋要予約の同居行。ラベルと部品のペア2組を両端に。
    optionsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    optionPair: { flexDirection: "row", alignItems: "center", gap: 8 },
    disclosure: { flexDirection: "row", alignItems: "center" },
    disclosureLabel: {
      fontSize: 13,
      fontWeight: "500",
      color: t.mutedForeground,
    },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
    footer: { flexDirection: "row", gap: 8, marginTop: 4 },
    deleteButton: {
      width: 44,
      height: 44,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.destructiveBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    submitButton: {
      flex: 1,
      height: 44,
      borderRadius: 6,
      backgroundColor: t.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    disabled: { opacity: 0.5 },
    error: {
      fontSize: 13,
      color: t.errorText,
      backgroundColor: t.errorBg,
      borderRadius: 6,
      padding: 10,
    },
  });
