import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import type { PlaceInput } from "@triplot/shared/data/place";
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

import {
  chipDateText,
  chipDateTimeText,
  chipEndTimeText,
  InlineNativePicker,
  PickerChip,
} from "./datetime-field";
import { PlacePicker } from "./place-picker";
import { TimezonePicker } from "./timezone-picker";
import { ToggleChip } from "./toggle-chip";
import { CompactSegment, VisibilitySegment } from "./visibility-segment";
import { PlusIcon, SaveIcon, TrashIcon } from "./icons";
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
  tripStart,
  defaultTimezone,
  events,
  editEvent,
  draft,
  slot,
  onDone,
  onSuccess,
}: {
  tripId: string;
  members: Member[];
  myMemberId: string;
  places: { id: string; name: string }[];
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
}) {
  const t = useTranslations("event");
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
  const [kind, setKind] = useState<Kind3>(initKind);

  const [title, setTitle] = useState(editEvent?.title ?? prefill?.title ?? "");
  const [note, setNote] = useState(editEvent?.note ?? prefill?.note ?? "");
  const [visibility, setVisibility] = useState<Visibility>(
    editEvent?.visibility ?? "shared",
  );
  const [needsReservation, setNeedsReservation] = useState(
    editEvent?.needsReservation ?? false,
  );
  const [place, setPlace] = useState<PlaceInput>(() => {
    if (editEvent) return { kind: "saved", placeId: editEvent.placeId };
    // 下書き: 保存済みマッチはそれを、無ければ抽出した場所名を自由入力テキスト
    // として事前入力（RN は Google 自動解決を持たないので web の低確信時と同じ
    // 自由入力フォールバック）。
    if (prefill?.place) return { kind: "saved", placeId: prefill.place.id };
    if (prefill?.autoResolvePlace)
      return { kind: "free", label: prefill.autoResolvePlace.name };
    return { kind: "saved", placeId: null };
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
  const [departTz, setDepartTz] = useState(
    editEvent?.startTz ??
      prefill?.departTz ??
      defaultTimezone ??
      "Asia/Tokyo",
  );
  const [arriveTz, setArriveTz] = useState(
    editEvent?.endTz ?? prefill?.arriveTz ?? defaultTimezone ?? "Asia/Tokyo",
  );

  // 通常/終日予定の乗継日TZ曖昧解決（web と同じ契約）。
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
    const submitKind = kind === "transit" ? "transit" : "normal";
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
    } else if (kind === "transit") {
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
      tzDisambigTransitId: kind === "transit" ? null : tzDisambigTransitId,
      tzDisambigSide: kind === "transit" ? null : tzDisambigSide,
      visibility,
      note: note.trim(),
      participantMemberIds: participantIds,
      place,
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
      {/* 種別セグメント */}
      <View style={styles.segment}>
        {(["timed", "allday", "transit"] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setKind(k)}
            style={[styles.segItem, kind === k && styles.segItemOn]}
          >
            <Text style={[styles.segText, kind === k && styles.segTextOn]}>
              {k === "timed"
                ? t("kindTimed")
                : k === "allday"
                  ? t("kindAllday")
                  : t("kindTransit")}
            </Text>
          </Pressable>
        ))}
      </View>
      {isTransit && <Text style={styles.hint}>{t("transitHint")}</Text>}

      {/* タイトル: ラベル無し＋placeholder＝フィールド名（iOS カレンダー方式）。 */}
      <BottomSheetTextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t("title")}
        accessibilityLabel={t("title")}
        placeholderTextColor={theme.subtleForeground}
        style={styles.input}
      />

      {/* 日時: web と同じ「開始 – 終了」の1行（開始＝日付＋時刻、終了＝時刻
          のみ・日跨ぎは "+n日"。終日は日付のみ）。チップタップで直下に inline
          ネイティブピッカー（TripIt / Apple カレンダーと同方式）。終日は
          日付タップ＝確定として自動で閉じる。 */}
      <View style={styles.dtGroup}>
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
                  moveAlldayStart(fmtDate(d));
                  setOpenPicker(null); // 日付タップ＝確定で閉じる
                } else if (kind === "transit") {
                  // 時差移動は出発/到着が別TZ＝長さの追従はしない（web と同じ）。
                  onStartDateChange(fmtDate(d));
                  setStartTime(fmtTime(d));
                } else {
                  moveStart(d);
                }
              } else {
                if (kind === "allday") {
                  setEndDate(fmtDate(d));
                  setOpenPicker(null);
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

      {/* 時差移動: 出発/到着TZ（web と同じ1行2列） */}
      {isTransit && (
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

      {/* 通常/終日: 乗継日のTZ曖昧解決（セグメント）。同じ TZ の候補は
          dedupeTzCandidates で1つに畳み、キーも TZ で照合する（選択の実体は
          transitId/side だが、ユーザにとっての選択単位は TZ のため）。 */}
      {!isTransit &&
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
      <PlacePicker
        places={places}
        value={place}
        onChange={setPlace}
        placeholder={t("place")}
      />

      {/* メモ */}
      <BottomSheetTextInput
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
          <VisibilitySegment value={visibility} onChange={setVisibility} />
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
    content: { padding: 16, gap: 14 },
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
    // 日時ブロック（ラベル行＋「開始 – 終了」チップ1行。web と同形）。
    dtGroup: {},
    dtChipsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dtSep: { fontSize: 14, color: t.subtleForeground },
    // 時差移動の出発/到着TZ（1行2列。web と同じ）。
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
