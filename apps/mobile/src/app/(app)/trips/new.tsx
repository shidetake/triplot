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

import { COMMON_CURRENCIES } from "@triplot/shared/currencies";
import { createTrip } from "@triplot/shared/data/trips";
import { fetchUserProfile } from "@triplot/shared/data/reads/trips";
import type { Currency } from "@triplot/shared/types/database";

import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";

// 旅行作成（モーダル）。web の create-trip-form 相当（コピー作成は後回し、
// 新規のみ）。成功で作成した旅行の詳細へ遷移。
export default function NewTripScreen() {
  const t = useTranslations("createTrip");
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => fetchUserProfile(supabase, userId!),
    enabled: !!userId,
  });

  const [title, setTitle] = useState("");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [currency, setCurrency] = useState<Currency>("JPY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 表示名はプロフィールの既定値をプレースホルダ兼初期値に。
  const effectiveName =
    displayName ?? profile?.display_name?.trim() ?? "";

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
    >

      <View>
        <Text style={styles.label}>{t("title")}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t("titlePlaceholder")}
          placeholderTextColor="rgba(0,0,0,0.38)"
          style={styles.input}
        />
      </View>

      <View>
        <Text style={styles.label}>{t("displayName")}</Text>
        <TextInput
          value={effectiveName}
          onChangeText={setDisplayName}
          placeholder="名前"
          placeholderTextColor="rgba(0,0,0,0.38)"
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
        <View style={styles.currencyWrap}>
          {COMMON_CURRENCIES.slice(0, 6).map((c) => (
            <Pressable
              key={c}
              onPress={() => setCurrency(c)}
              style={[
                styles.currencyChip,
                currency === c && styles.currencyChipOn,
              ]}
            >
              <Text
                style={[
                  styles.currencyText,
                  currency === c && styles.currencyTextOn,
                ]}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable
        onPress={() => void submit()}
        disabled={busy}
        style={[styles.submitButton, busy && styles.disabled]}
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

const styles = StyleSheet.create({
  // モーダルの地色はアプリ本体と同じ白（ナビバー帯とコンテンツ部で色が
  // 割れて見えるのを防ぐ）。
  screen: { backgroundColor: "#fff" },
  content: { padding: 16, gap: 16 },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 4 },
  input: {
    height: 36,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateSep: { fontSize: 14, color: "rgba(0,0,0,0.4)" },
  currencyWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  currencyChip: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  currencyChipOn: { backgroundColor: "#09090b", borderColor: "#09090b" },
  currencyText: { fontSize: 13 },
  currencyTextOn: { color: "#fff" },
  submitButton: {
    height: 44,
    borderRadius: 6,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitLabel: { color: "#fff", fontSize: 15, fontWeight: "500" },
  disabled: { opacity: 0.5 },
  error: {
    fontSize: 13,
    color: "#b91c1c",
    backgroundColor: "#fef2f2",
    borderRadius: 6,
    padding: 10,
  },
});
