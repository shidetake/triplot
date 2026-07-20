import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { buildExpensesCsv, type ExpenseCsvRow } from "@triplot/shared/expenseCsv";
import { hexToKmlColor } from "@triplot/shared/placeColor";
import { buildPlacesKml, type KmlPlacemark } from "@triplot/shared/placeKml";
import { buildTripTzTimeline } from "@triplot/shared/schedule";
import {
  deriveCategories,
  deriveOrderedExpenses,
  derivePlaces,
  deriveScheduleEvents,
} from "@triplot/shared/tripDerive";
import type { Currency } from "@triplot/shared/types/database";

import {
  CalendarDaysIcon,
  ChevronIcon,
  MapIcon,
  WalletIcon,
} from "@/components/icons";
import { SheetTitle } from "@/components/sheet-title";
import { googleSignInAvailable } from "@/lib/auth";
import { exportFileViaShareSheet, safeFilename } from "@/lib/exportFile";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useTripDetail } from "@/lib/useTripDetail";

// エクスポート（native formSheet ルートの中身）。出力先ごとの3行: 予定
// （Google カレンダー）は router.push で兄弟ルートへドリルイン、地図（KML）・
// 費用（CSV）はその場で生成して共有シートへ（web の ⋯ メニュー > エクスポート
// のドリルインに対応）。旅行編集からドリルインで開く。
export function ExportSheet({ tripId }: { tripId: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = useTranslations();
  const { data, me } = useTripDetail(tripId);

  if (!data?.trip || !me) return null;
  const trip = data.trip;
  const members = data.members ?? [];

  // 地図エクスポート（KML）。web は canvas でピン画像を焼いた KMZ だが、
  // モバイルは KML の標準機能の範囲＝既定マーカー＋色（確定/未確定）のみ。
  // カテゴリはデータ列で出るのでマイマップの色分けは同等にできる。
  const onExportMap = async () => {
    const mapped = derivePlaces(data.placesRaw).filter(
      (p) => p.lat != null && p.lng != null,
    );
    if (mapped.length === 0) {
      Alert.alert(t("tripActions.noPlaces"));
      return;
    }
    const marks: KmlPlacemark[] = mapped.map((p) => ({
      name: p.name,
      lat: p.lat!,
      lng: p.lng!,
      description:
        [p.formatted_address, p.note].filter(Boolean).join("\n") || null,
      styleId: p.tentative ? "tentative" : "confirmed",
      category: p.tentative
        ? t("place.statusCandidate")
        : t("place.statusConfirmed"),
    }));
    const kml = buildPlacesKml(trip.title, marks, [
      { id: "confirmed", color: hexToKmlColor("#10b981") },
      { id: "tentative", color: hexToKmlColor("#f59e0b") },
    ]);
    try {
      await exportFileViaShareSheet(`${safeFilename(trip.title)}.kml`, kml);
    } catch {
      Alert.alert(t("tripActions.mapExportFailed"));
    }
  };

  // 費用エクスポート（CSV）。行の組み立ては web の page.tsx と同じ名前解決。
  const onExportExpenses = async () => {
    const scheduleEvents = deriveScheduleEvents(data.eventsRaw, data.todosRaw);
    const tzTimeline = buildTripTzTimeline(
      scheduleEvents,
      trip.default_timezone,
    );
    const expenses = deriveOrderedExpenses(data.expensesRaw, tzTimeline);
    if (expenses.length === 0) {
      Alert.alert(t("tripActions.noExpenses"));
      return;
    }
    const categoryNameById = new Map(
      deriveCategories(data.categoriesRaw).map((c) => [c.id, c.name]),
    );
    const memberNameById = new Map(
      members.map((m) => [m.id, m.display_name]),
    );
    const placeNameById = new Map(
      derivePlaces(data.placesRaw).map((p) => [p.id, p.name]),
    );
    const defaultCurrency = trip.default_currency as Currency;
    const rows: ExpenseCsvRow[] = expenses.map((e) => ({
      date: e.paid_at.slice(0, 10),
      category: categoryNameById.get(e.category_id) ?? "",
      payer: memberNameById.get(e.payer_member_id) ?? "",
      localAmount: e.local_price,
      localCurrency: e.local_currency,
      // 小数誤差を避けて精算通貨の最小単位想定で 2 桁に丸め（web と同じ）。
      defaultAmount: Math.round(e.local_price * e.rate_to_default * 100) / 100,
      defaultCurrency,
      splittable: e.splittable,
      visibility: e.visibility,
      place: e.place_id ? (placeNameById.get(e.place_id) ?? "") : "",
      note: e.note ?? "",
    }));
    try {
      await exportFileViaShareSheet(
        `${safeFilename(trip.title)}-expenses.csv`,
        buildExpensesCsv(rows),
      );
    } catch {
      Alert.alert(t("tripActions.mapExportFailed"));
    }
  };

  return (
    <View style={styles.content}>
      <SheetTitle>{t("tripActions.export")}</SheetTitle>

      {/* カレンダーは Google Sign-In の設定がある環境だけ（トークン取得に必要） */}
      {googleSignInAvailable && (
        <Pressable
          onPress={() => router.push(`/trips/${tripId}/calendar-export`)}
          style={styles.navRow}
        >
          <CalendarDaysIcon size={18} color={theme.mutedForeground} />
          <Text style={styles.navRowLabel}>
            {t("tripActions.exportCalendar")}
          </Text>
          <ChevronIcon size={16} color={theme.subtleForeground} />
        </Pressable>
      )}
      <Pressable onPress={() => void onExportMap()} style={styles.navRow}>
        <MapIcon size={18} color={theme.mutedForeground} />
        <Text style={styles.navRowLabel}>{t("tripActions.exportMapKml")}</Text>
      </Pressable>
      <Pressable onPress={() => void onExportExpenses()} style={styles.navRow}>
        <WalletIcon size={18} color={theme.mutedForeground} />
        <Text style={styles.navRowLabel}>{t("tripActions.exportExpenses")}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: 16 },
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.08),
    },
    navRowLabel: { flex: 1, fontSize: 14, color: t.foreground },
  });
