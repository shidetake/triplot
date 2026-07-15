import { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import {
  createGcalCalendar,
  GcalApiError,
  type GcalCalendarItem,
  insertGcalEvent,
  listWritableGcalCalendars,
} from "@triplot/shared/gcalApi";
import {
  buildCalendarExportEvents,
  toGcalEvent,
} from "@triplot/shared/gcalEvent";
import { buildTripTzTimeline } from "@triplot/shared/schedule";
import { deriveScheduleEvents } from "@triplot/shared/tripDerive";

import { CheckIcon } from "@/components/icons";
import { SheetTitle } from "@/components/sheet-title";
import { CompactSegment } from "@/components/visibility-segment";
import { getGcalAccessToken } from "@/lib/gcalToken";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

const NEW = "__new__";

type Phase = "connect" | "loading" | "pick" | "exporting" | "done" | "error";

// Google カレンダーへエクスポート（モーダル）。web の CalendarExportDialog と
// 同じ流れ（接続 → 出力範囲/エクスポート先を選ぶ → 直列投入 → 完了）。
// トークンは native Google Sign-In の追加スコープで取得（lib/gcalToken）、
// API 呼び出し・予定変換は shared（gcalApi / gcalEvent）で web と共用。
// 出力範囲は RN の流儀でセグメント（web はラジオ）。
export default function CalendarExportScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tripId = useTripId();
  const t = useTranslations("calendarExport");
  const { data, me } = useTripDetail(tripId);

  const [phase, setPhase] = useState<Phase>("connect");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<GcalCalendarItem[]>([]);
  const [selected, setSelected] = useState<string>(NEW);
  const [newName, setNewName] = useState<string | null>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });

  if (!data?.trip || !me) return null;
  const trip = data.trip;

  const scheduleEvents = deriveScheduleEvents(data.eventsRaw, data.todosRaw);
  const tzTimeline = buildTripTzTimeline(
    scheduleEvents,
    trip.default_timezone,
  );
  const events = buildCalendarExportEvents(scheduleEvents, {
    myMemberId: me.id,
    places: (data.placesRaw ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      formatted_address: p.formatted_address,
    })),
    tzTimeline,
  });
  const mineEvents = events.filter((e) => e.mine);
  const targetEvents = scope === "mine" ? mineEvents : events;
  const vNewName = newName ?? `triplot_${trip.title}`;

  const connect = async () => {
    setError(null);
    setPhase("loading");
    try {
      const tk = await getGcalAccessToken();
      if (!tk) {
        // キャンセル。接続前に戻すだけ（エラー扱いにしない）。
        setPhase("connect");
        return;
      }
      setToken(tk);
      // 書き込み先候補＝過去に triplot が作ったカレンダー。取れなくても
      // 新規作成はできるので、失敗は空リストに落として先へ進める（web と同じ）。
      try {
        setCalendars(await listWritableGcalCalendars(tk));
      } catch {
        setCalendars([]);
      }
      setSelected(NEW);
      setPhase("pick");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const runExport = async () => {
    if (!token) return;
    setError(null);
    setPhase("exporting");
    try {
      let calendarId = selected;
      if (selected === NEW) {
        const name = vNewName.trim() || `triplot_${trip.title}`;
        try {
          calendarId = await createGcalCalendar(token, name);
        } catch (e) {
          throw new Error(
            t("calendarCreateFailed", {
              status: e instanceof GcalApiError ? e.status : "?",
            }),
          );
        }
      }
      let done = 0;
      let failed = 0;
      setProgress({ done: 0, total: targetEvents.length, failed: 0 });
      // 直列で投入（レート制限・部分失敗の把握を簡単にする。web と同じ）。
      for (const ev of targetEvents) {
        const ok = await insertGcalEvent(token, calendarId, toGcalEvent(ev));
        if (ok) done += 1;
        else failed += 1;
        setProgress({ done, total: targetEvents.length, failed });
      }
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      // iOS: キーボード表示時に自動でスクロール領域を調整し、フォーカス中の
      // 入力欄がキーボードの裏に隠れないようにする。
      automaticallyAdjustKeyboardInsets
    >
      <SheetTitle>{t("heading")}</SheetTitle>

      {(phase === "connect" || phase === "pick") && (
        <View>
          <Text style={styles.label}>{t("scopeLabel")}</Text>
          {/* 件数はセグメントに詰め込まず送信ボタン側に出す（ラベルの
              文字数差で左右バランスが崩れるのを避ける）。 */}
          <CompactSegment
            grow
            options={[
              { key: "mine", label: t("scopeMineSegment") },
              { key: "all", label: t("scopeAllSegment") },
            ]}
            value={scope}
            onChange={setScope}
          />
        </View>
      )}

      {phase === "connect" && (
        <Pressable onPress={() => void connect()} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>{t("connectButton")}</Text>
        </Pressable>
      )}

      {(phase === "loading" || phase === "exporting") && (
        <Text style={styles.note}>
          {phase === "loading"
            ? t("loading")
            : t("exporting", {
                done: progress.done,
                total: progress.total,
              }) +
              (progress.failed > 0
                ? t("failedCount", { count: progress.failed })
                : "")}
        </Text>
      )}

      {phase === "pick" && (
        <>
          <View>
            <Text style={styles.label}>{t("targetLabel")}</Text>
            <Pressable
              onPress={() => setSelected(NEW)}
              style={styles.targetRow}
            >
              <Text style={styles.targetName} numberOfLines={1}>
                {t("newCalendar")}
              </Text>
              {selected === NEW && (
                <CheckIcon size={16} color={theme.foreground} />
              )}
            </Pressable>
            {selected === NEW && (
              <TextInput
                value={vNewName}
                onChangeText={setNewName}
                placeholder={`triplot_${trip.title}`}
                placeholderTextColor={theme.subtleForeground}
                style={styles.input}
              />
            )}
            {calendars.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setSelected(c.id)}
                style={styles.targetRow}
              >
                <Text style={styles.targetName} numberOfLines={1}>
                  {c.summary}
                </Text>
                {selected === c.id && (
                  <CheckIcon size={16} color={theme.foreground} />
                )}
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => void runExport()}
            disabled={targetEvents.length === 0}
            style={[
              styles.primaryButton,
              targetEvents.length === 0 && styles.disabled,
            ]}
          >
            <Text style={styles.primaryLabel}>
              {t("exportButton", { count: targetEvents.length })}
            </Text>
          </Pressable>
        </>
      )}

      {phase === "done" && (
        <View style={styles.doneBox}>
          <View style={styles.doneRow}>
            <CheckIcon size={16} color={theme.foreground} />
            <Text style={styles.doneText}>
              {t("successMessage", { done: progress.done })}
              {progress.failed > 0 &&
                t("failedCount", { count: progress.failed })}
            </Text>
          </View>
          <Pressable
            onPress={() => void Linking.openURL("https://calendar.google.com/")}
            style={styles.outlineButton}
          >
            <Text style={styles.outlineLabel}>{t("openGcal")}</Text>
          </Pressable>
        </View>
      )}

      {phase === "error" && (
        <View style={styles.doneBox}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => void connect()} style={styles.outlineButton}>
            <Text style={styles.outlineLabel}>{t("retry")}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { backgroundColor: t.background },
    content: { padding: 16, gap: 16, paddingBottom: 48 },
    label: {
      fontSize: 13,
      fontWeight: "500",
      marginBottom: 6,
      color: t.foreground,
    },
    note: {
      fontSize: 13,
      color: t.mutedForeground,
      textAlign: "center",
      paddingVertical: 8,
    },
    targetRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.08),
    },
    targetName: { flex: 1, fontSize: 14, color: t.foreground },
    input: {
      height: 36,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 10,
      fontSize: 14,
      color: t.foreground,
      marginTop: 8,
    },
    primaryButton: {
      height: 44,
      borderRadius: 6,
      backgroundColor: t.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryLabel: {
      color: t.primaryForeground,
      fontSize: 15,
      fontWeight: "500",
    },
    outlineButton: {
      height: 40,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      alignItems: "center",
      justifyContent: "center",
    },
    outlineLabel: { fontSize: 13, fontWeight: "500", color: t.foreground },
    disabled: { opacity: 0.5 },
    doneBox: { gap: 12 },
    doneRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    doneText: { fontSize: 14, color: t.foreground },
    error: {
      fontSize: 13,
      color: t.errorText,
      backgroundColor: t.errorBg,
      borderRadius: 6,
      padding: 10,
    },
  });
