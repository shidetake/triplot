import DateTimePicker from "@react-native-community/datetimepicker";
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
import {
  createEvent,
  deleteEvent,
  updateEvent,
  type EventFields,
} from "@triplot/shared/data/events";
import {
  buildTripTzTimeline,
  resolveExpenseTz,
  type TzCandidate,
} from "@triplot/shared/schedule";
import type { EventDraftItem } from "@triplot/shared/import/drafts";
import type { EventRow } from "@triplot/shared/tripDerive";
import { tzDisplayLabel } from "@triplot/shared/timezones";
import type { Visibility } from "@triplot/shared/types/database";

import { PlacePicker } from "./place-picker";
import { TimezonePicker } from "./timezone-picker";
import { ToggleChip } from "./toggle-chip";
import { TrashIcon } from "./icons";
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
    editEvent?.startAt.slice(0, 10) ?? draft?.date ?? tripStart ?? today();
  const initTime = editEvent?.startAt.slice(11, 16) ?? draft?.time ?? "09:00";
  const [startDate, setStartDate] = useState(initDate);
  const [startTime, setStartTime] = useState(initTime);
  const initEndDate =
    editEvent?.endAt?.slice(0, 10) ?? prefill?.endDate ?? initDate;
  const initEndTime =
    editEvent?.endAt?.slice(11, 16) ?? prefill?.endTime ?? addHour(initTime);
  const [endDate, setEndDate] = useState(initEndDate);
  const [endTime, setEndTime] = useState(initEndTime);

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

      {/* タイトル */}
      <View>
        <Text style={styles.label}>{t("title")}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={
            isTransit ? t("placeholderTitleTransit") : t("placeholderTitle")
          }
          placeholderTextColor={theme.subtleForeground}
          style={styles.input}
        />
      </View>

      {/* 日時 */}
      {kind === "allday" ? (
        <View style={styles.row2}>
          <DateField
            label={t("date")}
            date={startDate}
            onChange={onStartDateChange}
          />
          <DateField
            label={t("endDateTime")}
            date={endDate}
            onChange={setEndDate}
          />
        </View>
      ) : (
        <>
          <View style={styles.row2}>
            <DateField
              label={isTransit ? t("departDateTime") : t("startDateTime")}
              date={startDate}
              onChange={onStartDateChange}
            />
            <TimeField
              date={startDate}
              time={startTime}
              onChange={setStartTime}
            />
          </View>
          <View style={styles.row2}>
            <DateField
              label={isTransit ? t("arriveDateTime") : t("endDateTime")}
              date={endDate}
              onChange={setEndDate}
            />
            <TimeField date={endDate} time={endTime} onChange={setEndTime} />
          </View>
        </>
      )}

      {/* 時差移動: 出発/到着TZ */}
      {isTransit && (
        <>
          <View>
            <Text style={styles.label}>{t("departTz")}</Text>
            <TimezonePicker value={departTz} onChange={setDepartTz} />
          </View>
          <View>
            <Text style={styles.label}>{t("arriveTz")}</Text>
            <TimezonePicker value={arriveTz} onChange={setArriveTz} />
          </View>
        </>
      )}

      {/* 通常/終日: 乗継日のTZ曖昧解決 */}
      {!isTransit &&
        multiTz &&
        startTzRes.kind === "ambiguous" && (
          <View>
            <Text style={styles.hint}>{t("transitDay")}</Text>
            <View style={styles.tzOptions}>
              {startTzRes.options.map((opt) => {
                const on =
                  tzDisambigTransitId === opt.transitId &&
                  tzDisambigSide === opt.side;
                return (
                  <Pressable
                    key={`${opt.transitId}-${opt.side}`}
                    onPress={() => selectTz(opt)}
                    style={styles.radioRow}
                  >
                    <View style={[styles.radio, on && styles.radioOn]} />
                    <Text style={styles.radioLabel}>
                      {tzDisplayLabel(opt.tz)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

      {/* 場所 */}
      <View>
        <Text style={styles.label}>{t("place")}</Text>
        <PlacePicker places={places} value={place} onChange={setPlace} />
      </View>

      {/* メモ */}
      <View>
        <Text style={styles.label}>{t("memo")}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={
            isTransit ? t("placeholderNoteTransit") : t("placeholderNote")
          }
          placeholderTextColor={theme.subtleForeground}
          style={styles.input}
        />
      </View>

      {/* 要予約 */}
      <View style={styles.switchRow}>
        <Text style={styles.label}>{t("needsReservation")}</Text>
        <Switch value={needsReservation} onValueChange={setNeedsReservation} />
      </View>

      {/* 公開範囲 */}
      <View style={styles.inlineRow}>
        <Text style={styles.label}>{t("visibility")}</Text>
        {(["shared", "private"] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => setVisibility(v)}
            style={styles.radioRow}
          >
            <View style={[styles.radio, visibility === v && styles.radioOn]} />
            <Text style={styles.radioLabel}>
              {v === "shared" ? t("visibilityShared") : t("visibilitySelfOnly")}
            </Text>
          </Pressable>
        ))}
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
          disabled={busy}
          style={[styles.submitButton, busy && styles.disabled]}
        >
          <Text style={styles.submitLabel}>{isEdit ? "保存" : "追加"}</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function DateField({
  label,
  date,
  onChange,
}: {
  label: string;
  date: string;
  onChange: (d: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.grow}>
      <Text style={styles.label}>{label}</Text>
      <DateTimePicker
        value={new Date(`${date}T12:00:00`)}
        mode="date"
        display="compact"
        onChange={(_, d) => {
          if (d) onChange(fmtDate(d));
        }}
        style={styles.picker}
      />
    </View>
  );
}

function TimeField({
  date,
  time,
  onChange,
}: {
  date: string;
  time: string;
  onChange: (t: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.timeCol}>
      <Text style={[styles.label, styles.invisible]}>時刻</Text>
      <DateTimePicker
        value={new Date(`${date}T${time}:00`)}
        mode="time"
        display="compact"
        onChange={(_, d) => {
          if (d) onChange(fmtTime(d));
        }}
        style={styles.picker}
      />
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
    invisible: { opacity: 0 },
    input: {
      height: 36,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 10,
      fontSize: 14,
      color: t.foreground,
    },
    row2: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
    grow: { flex: 1 },
    timeCol: { width: 110 },
    picker: { alignSelf: "flex-start", marginLeft: -8 },
    tzOptions: { marginTop: 6, gap: 6 },
    inlineRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    radioRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    radio: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: t.fgAlpha(0.35),
    },
    radioOn: { borderWidth: 5, borderColor: t.primary },
    radioLabel: { fontSize: 13, color: t.foreground },
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
    submitLabel: {
      color: t.primaryForeground,
      fontSize: 15,
      fontWeight: "500",
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
