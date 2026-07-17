import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { createTrip } from "@triplot/shared/data/trips";
import { fetchMyTrips, fetchUserProfile } from "@triplot/shared/data/reads/trips";
import { tripDayCount } from "@triplot/shared/tripCopy";
import type { Currency } from "@triplot/shared/types/database";

import {
  CopySourceModal,
  CopySourceTrigger,
} from "@/components/copy-source-picker";
import {
  chipDateText,
  InlineNativePicker,
  PickerChip,
} from "@/components/datetime-field";
import { CurrencyPickerModal, CurrencyPickerTrigger } from "@/components/currency-picker";
import { PlusIcon } from "@/components/icons";
import { SheetTitle } from "@/components/sheet-title";
import { CompactSegment } from "@/components/visibility-segment";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useSession } from "@/lib/session";

// 旅行作成（FormSheet の中身）。web の create-trip-form と同じ2モード
// （新規/過去の旅行をコピー）。成功でシートを閉じ、作成した旅行の詳細へ遷移。
export function NewTripSheet({ onDone }: { onDone: () => void }) {
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
  // 日程の inline カレンダーの開閉（同時に開くのは1つだけ）。
  const [openPicker, setOpenPicker] = useState<"start" | "end" | null>(null);
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
    onDone();
    router.replace(`/trips/${r.data.tripId}`);
  };

  return (
    <View style={styles.content}>
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

      {/* コピー元行は新規モードでも透明のまま場所を確保する（条件レンダーだと
          モード切替のたびにシートの高さが伸縮して気持ち悪い＝高い方の
          「コピーして作成」の高さに固定する）。 */}
      {canCopy && (
        <View
          style={mode === "new" && styles.hiddenKeepSpace}
          pointerEvents={mode === "new" ? "none" : "auto"}
        >
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
      <BottomSheetTextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t("title")}
        accessibilityLabel={t("title")}
        placeholderTextColor={theme.subtleForeground}
        style={styles.input}
      />

      <View>
        <Text style={styles.label}>{t("displayName")}</Text>
        <BottomSheetTextInput
          value={effectiveName}
          onChangeText={setDisplayName}
          placeholder="名前"
          placeholderTextColor={theme.subtleForeground}
          style={styles.input}
        />
      </View>

      {/* 日程: チップ→直下に inline カレンダー、日付タップ＝確定で閉じる
          （datetime-field の共通方式）。範囲選択カレンダーは iOS ネイティブに
          存在しないため開始/終了の2チップ。 */}
      <View>
        <Text style={styles.label}>{t("dates")}</Text>
        <View style={styles.dateRow}>
          <PickerChip
            text={chipDateText(startDate)}
            active={openPicker === "start"}
            onPress={() =>
              setOpenPicker((p) => (p === "start" ? null : "start"))
            }
          />
          <Text style={styles.dateSep}>→</Text>
          <PickerChip
            text={chipDateText(endDate)}
            active={openPicker === "end"}
            onPress={() => setOpenPicker((p) => (p === "end" ? null : "end"))}
          />
        </View>
        {openPicker === "start" && (
          <InlineNativePicker
            value={new Date(`${startDate}T12:00:00`)}
            mode="date"
            onChange={(d) => {
              const v = fmtDate(d);
              setStartDate(v);
              if (endDate < v) setEndDate(v);
              // 作成時は開始も終了も必ず選ぶので、開始を選んだらそのまま
              // 終了の選択へ進める（Airbnb 等の範囲カレンダーの
              // 「1タップ目=開始、2タップ目=終了」と同じ体験）。
              setOpenPicker("end");
            }}
          />
        )}
        {openPicker === "end" && (
          <InlineNativePicker
            value={new Date(`${endDate}T12:00:00`)}
            mode="date"
            minimumDate={new Date(`${startDate}T12:00:00`)}
            onChange={(d) => {
              setEndDate(fmtDate(d));
              setOpenPicker(null);
            }}
          />
        )}
      </View>

      <View>
        <Text style={styles.label}>{t("settlementCurrency")}</Text>
        {/* 通貨は web と同じ全170通貨から選べる（以前は6件に絞った独自
            chip 実装だった）。トリガー＋モーダルは編集シートと共通の
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
        accessibilityLabel="旅行を作成"
        style={[
          styles.submitButton,
          (busy || !title.trim()) && styles.disabled,
        ]}
      >
        <PlusIcon size={20} color={theme.primaryForeground} />
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
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
  content: { paddingHorizontal: 16, gap: 16 },
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
  // 新規モードでコピー元行の場所だけ確保する（シート高さをモードで変えない）。
  hiddenKeepSpace: { opacity: 0 },
  submitButton: {
    height: 44,
    borderRadius: 6,
    backgroundColor: t.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
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
