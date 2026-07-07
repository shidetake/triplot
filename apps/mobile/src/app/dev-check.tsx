import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { formatDayLabel, wallClockToUtcMs } from "@triplot/shared/schedule";

import { supabase } from "@/lib/supabase";

// ── M0 の受け入れ確認用の一時画面（M3 で旅行一覧に置き換える） ──
// 1. i18n: 共有カタログの文言が出るか
// 2. Supabase: auth.getSession() が通るか（未ログインで session=null が正常）
// 3. Hermes の Intl: schedule.ts が依存する IANA timeZone 計算が web と同値か
//    （期待値は node で packages/shared/src/schedule.ts を直接実行して得た値）

type Check = { name: string; pass: boolean; actual: string };

function runIntlChecks(): Check[] {
  const checks: Check[] = [];
  const tokyo = wallClockToUtcMs("2026-01-01T10:00", "Asia/Tokyo");
  checks.push({
    name: "wallClockToUtcMs(Asia/Tokyo)",
    pass: tokyo === 1767229200000,
    actual: String(tokyo),
  });
  const honolulu = wallClockToUtcMs("2026-01-01T10:00", "Pacific/Honolulu");
  checks.push({
    name: "wallClockToUtcMs(Pacific/Honolulu)",
    pass: honolulu === 1767297600000,
    actual: String(honolulu),
  });
  const label = formatDayLabel("2026-07-07");
  checks.push({
    name: "formatDayLabel(2026-07-07)",
    pass: label === "7/7(火)",
    actual: label,
  });
  return checks;
}

export default function DevCheckScreen() {
  const t = useTranslations("tripTabs");
  const [sessionState, setSessionState] = useState("確認中...");
  const [checks, setChecks] = useState<Check[]>([]);

  useEffect(() => {
    setChecks(runIntlChecks());
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          setSessionState(`エラー: ${error.message}`);
        } else {
          setSessionState(
            data.session ? `ログイン中: ${data.session.user.email}` : "未ログイン（接続OK）",
          );
        }
      })
      .catch((e: unknown) => setSessionState(`接続失敗: ${String(e)}`));
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>triplot M0 チェック</Text>

      <Text style={styles.sectionTitle}>i18n（共有カタログ）</Text>
      <Text style={styles.body}>
        {t("schedule")} / {t("places")} / {t("expenses")} / {t("todos")}
      </Text>

      <Text style={styles.sectionTitle}>Supabase</Text>
      <Text style={styles.body}>{sessionState}</Text>

      <Text style={styles.sectionTitle}>Hermes Intl（schedule.ts の前提）</Text>
      {checks.map((c) => (
        <View key={c.name} style={styles.checkRow}>
          <Text style={c.pass ? styles.pass : styles.fail}>
            {c.pass ? "✓" : "✗"} {c.name}
          </Text>
          <Text style={styles.actual}>= {c.actual}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 4 },
  heading: { fontSize: 20, fontWeight: "600", marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "600", marginTop: 16 },
  body: { fontSize: 14 },
  checkRow: { marginTop: 4 },
  pass: { color: "#16a34a", fontSize: 14 },
  fail: { color: "#dc2626", fontSize: 14, fontWeight: "700" },
  actual: { color: "#71717a", fontSize: 12, marginLeft: 16 },
});
