import DateTimePicker from "@react-native-community/datetimepicker";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import { createTrip } from "@triplot/shared/data/trips";
import { fetchMyTrips, fetchUserProfile } from "@triplot/shared/data/reads/trips";
import { tripDayCount } from "@triplot/shared/tripCopy";
import type { Currency } from "@triplot/shared/types/database";

import {
  CopySourceModal,
  CopySourceTrigger,
} from "@/components/copy-source-picker";
import { CurrencyPickerModal, CurrencyPickerTrigger } from "@/components/currency-picker";
import { SheetTitle } from "@/components/sheet-title";
import { CompactSegment } from "@/components/visibility-segment";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useSession } from "@/lib/session";

// 旅行作成（モーダル）。web の create-trip-form と同じ2モード
// （新規/過去の旅行をコピー）。成功で作成した旅行の詳細へ遷移。
export default function NewTripScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = useTranslations("createTrip");
  const tTrips = useTranslations("trips");
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => fetchUserProfile(supabase, userId!),
    enabled: !!userId,
  });
  // コピー元候補（自分が参加している既存の旅行）。
  const { data: myTrips } = useQuery({
    queryKey: ["myTrips", userId],
    queryFn: () => fetchMyTrips(supabase, userId!),
    enabled: !!userId,
  });
  const trips = myTrips?.trips ?? [];
  const canCopy = trips.length > 0;

  const [mode, setMode] = useState<"new" | "copy">("new");
  const [sourceId, setSourceId] = useState("");
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  // 既定は前回旅行の精算通貨。過去の旅行がなければ JPY（web と同じ）。
  const lastCurrency = (trips[0]?.default_currency ?? "JPY") as Currency;
  const [currency, setCurrency] = useState<Currency>(lastCurrency);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 表示名はプロフィールの既定値をプレースホルダ兼初期値に。
  const effectiveName =
    displayName ?? profile?.display_name?.trim() ?? "";

  // コピー元を選んだらタイトル・通貨をプリフィル（web の pickSource と同じ）。
  const pickSource = (id: string) => {
    setSourceId(id);
    const src = trips.find((x) => x.id === id);
    if (src) {
      setTitle(src.title);
      if (/^[A-Z]{3}$/.test(src.default_currency)) {
        setCurrency(src.default_currency as Currency);
      }
    }
  };

  // 新しい日程がコピー元より短いと、両端優先で中日の予定が省かれる警告。
  const source = trips.find((x) => x.id === sourceId);
  const sourceDays =
    source?.start_date && source.end_date
      ? tripDayCount(source.start_date, source.end_date)
      : null;
  const newDays = tripDayCount(startDate, endDate);
  const showShorterWarning =
    mode === "copy" && sourceDays !== null && newDays < sourceDays;

  const submit = async () => {
    if (!title.trim() || !effectiveName.trim()) {
      setError(t("fillAll"));
      return;
    }
    setBusy(true);
    setError(null);
    const r = await createTrip(supabase, {
      title: title.trim(),
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
      displayName: effectiveName.trim(),
      currency,
      sourceTripId: mode === "copy" && sourceId ? sourceId : undefined,
      clientTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.replace(`/trips/${r.data.tripId}`);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      // iOS: キーボード表示時に自動でスクロール領域を調整し、フォーカス中の
      // 入力欄がキーボードの裏に隠れないようにする。
      automaticallyAdjustKeyboardInsets
      // formSheet が fitToContents（内容ちょうどの高さ）のとき、内容が
      // コンテナより小さいのに引っ張るとラバーバンドして「中身だけ動く」
      // 不自然な見た目になる。中身がぴったり収まる時はバウンスさせない
      // （収まらない時は通常どおりスクロール・端バウンスする）。
      alwaysBounceVertical={false}
    >
      <SheetTitle>{tTrips("create")}</SheetTitle>

      {/* 作り方の選択（過去の旅行が無ければ出さない。web と同じセグメント）。 */}
      {canCopy && (
        <CompactSegment
          grow
          options={[
            { key: "new", label: t("modeNew") },
            { key: "copy", label: t("modeCopy") },
          ]}
          value={mode}
          onChange={(v) => {
            setMode(v);
            if (v === "new") setSourceId("");
          }}
        />
      )}

      {mode === "copy" && (
        <View>
          <Text style={styles.label}>{t("copySource")}</Text>
          <CopySourceTrigger
            trips={trips}
            value={sourceId}
            onPress={() => setSourcePickerOpen(true)}
            placeholder={t("selectTrip")}
          />
        </View>
      )}

      <CopySourceModal
        visible={sourcePickerOpen}
        trips={trips}
        value={sourceId}
        onSelect={pickSource}
        onClose={() => setSourcePickerOpen(false)}
        title={t("copySource")}
      />

      {/* タイトル: ラベル無し＋placeholder＝フィールド名（iOS カレンダー方式）。
          必須は * でなく「埋まるまで作成無効」。表示名は説明を持つラベルなので残す。 */}
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t("title")}
        accessibilityLabel={t("title")}
        placeholderTextColor={theme.subtleForeground}
        style={styles.input}
      />

      <View>
        <Text style={styles.label}>{t("displayName")}</Text>
        <TextInput
          value={effectiveName}
          onChangeText={setDisplayName}
          placeholder="名前"
          placeholderTextColor={theme.subtleForeground}
          style={styles.input}
        />
      </View>

      <View>
        <Text style={styles.label}>{t("dates")}</Text>
        <View style={styles.dateRow}>
          <DateTimePicker
            value={new Date(`${startDate}T12:00:00`)}
            mode="date"
            display="compact"
            onChange={(_, d) => {
              if (!d) return;
              const v = fmtDate(d);
              setStartDate(v);
              if (endDate < v) setEndDate(v);
            }}
          />
          <Text style={styles.dateSep}>→</Text>
          <DateTimePicker
            value={new Date(`${endDate}T12:00:00`)}
            mode="date"
            display="compact"
            minimumDate={new Date(`${startDate}T12:00:00`)}
            onChange={(_, d) => {
              if (d) setEndDate(fmtDate(d));
            }}
          />
        </View>
      </View>

      <View>
        <Text style={styles.label}>{t("settlementCurrency")}</Text>
        {/* 通貨は web と同じ全170通貨から選べる（以前は6件に絞った独自
            chip 実装だった）。トリガー＋モーダルは編集画面と共通の
            CurrencyPickerModal。web の「精算通貨とは」ヘルプツールチップは
            RN 側に HelpTip 部品が無いので今回は省略（別途対応する）。 */}
        <CurrencyPickerTrigger
          value={currency}
          onPress={() => setCurrencyPickerOpen(true)}
        />
      </View>

      <CurrencyPickerModal
        visible={currencyPickerOpen}
        value={currency}
        onSelect={setCurrency}
        onClose={() => setCurrencyPickerOpen(false)}
        title={t("settlementCurrency")}
      />

      {showShorterWarning && (
        <Text style={styles.warn}>{t("shorterWarning")}</Text>
      )}

      <Pressable
        onPress={() => void submit()}
        // 必須（タイトル）は * でなく「埋まるまで作成無効」で表現（iOS 方式）。
        disabled={busy || !title.trim()}
        style={[
          styles.submitButton,
          (busy || !title.trim()) && styles.disabled,
        ]}
      >
        <Text style={styles.submitLabel}>
          {busy ? "作成中..." : "旅行を作成"}
        </Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

function todayStr(): string {
  const d = new Date();
  return fmtDate(d);
}
function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  // モーダルの地色はアプリ本体と同じ白（ナビバー帯とコンテンツ部で色が
  // 割れて見えるのを防ぐ）。
  screen: { backgroundColor: t.background },
  content: { padding: 16, gap: 16 },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 4, color: t.foreground },
  input: {
    height: 36,
    borderWidth: 1,
    borderColor: t.fgAlpha(0.2),
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    color: t.foreground,
  },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateSep: { fontSize: 14, color: t.subtleForeground },
  warn: { fontSize: 12, color: t.warnAccent },
  submitButton: {
    height: 44,
    borderRadius: 6,
    backgroundColor: t.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitLabel: { color: t.primaryForeground, fontSize: 15, fontWeight: "500" },
  disabled: { opacity: 0.5 },
  error: {
    fontSize: 13,
    color: t.errorText,
    backgroundColor: t.errorBg,
    borderRadius: 6,
    padding: 10,
  },
});
