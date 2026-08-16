import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { buildExpensesCsv, type ExpenseCsvRow } from "@triplot/shared/expenseCsv";
import {
  buildPlacesKml,
  type KmlPlacemark,
  type KmlStyle,
} from "@triplot/shared/placeKml";
import { planKmz, type KmzPlan } from "@triplot/shared/placeKmz";
import { buildZip, type ZipEntry } from "@triplot/shared/zip";
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
import { PinPngRenderer } from "@/components/pin-png-renderer";
import { SheetTitle } from "@/components/sheet-title";
import { googleSignInAvailable } from "@/lib/auth";
import {
  exportBytesViaShareSheet,
  exportFileViaShareSheet,
  safeFilename,
} from "@/lib/exportFile";
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
  // ピン画像を描いている最中の KMZ 計画（描き終わったら zip にする）。
  const [pendingKmz, setPendingKmz] = useState<KmzPlan | null>(null);

  if (!data?.trip || !me) return null;
  const trip = data.trip;
  const members = data.members ?? [];

  // 地図エクスポート（KMZ = KML ＋ ピン画像の zip。web と同じ出力）。
  // 色（確定=緑/候補=琥珀）とカテゴリアイコンを焼き込んだピン画像を同梱する
  // ので、Google Earth では色付きピンで、マイマップでは色・カテゴリ列が活きる。
  // ピン画像は端末で描く（PinPngRenderer）ため、必要な画像が揃ってから
  // zip を組む2段構えになっている。
  const onExportMap = () => {
    const mapped = derivePlaces(data.placesRaw).filter(
      (p) => p.lat != null && p.lng != null,
    );
    if (mapped.length === 0) {
      Alert.alert(t("tripActions.noPlaces"));
      return;
    }
    const placemarks: KmlPlacemark[] = mapped.map((p) => ({
      name: p.name,
      lat: p.lat!,
      lng: p.lng!,
      description:
        [p.formatted_address, p.note].filter(Boolean).join("\n") || null,
      colorHex: p.tentative ? "#f59e0b" : "#10b981",
      category: p.tentative
        ? t("place.statusCandidate")
        : t("place.statusConfirmed"),
      iconKey: p.icon,
    }));
    // (アイコン × 色) の畳み込みとスタイル ID 割り当ては shared（web と共用）。
    const plan = planKmz(placemarks);
    if (plan.needs.length === 0) {
      void writeKmz(plan.marks, plan.styles, []);
      return;
    }
    setPendingKmz(plan);
  };

  // 画像が揃った（または最初から不要だった）ら KMZ を書き出して共有シートへ。
  const writeKmz = async (
    marks: KmlPlacemark[],
    styles: KmlStyle[],
    files: ZipEntry[],
  ) => {
    setPendingKmz(null);
    try {
      const kml = buildPlacesKml(trip.title, marks, styles);
      const zip = buildZip([
        { name: "doc.kml", data: new TextEncoder().encode(kml) },
        ...files,
      ]);
      await exportBytesViaShareSheet(`${safeFilename(trip.title)}.kmz`, zip);
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
      <Pressable onPress={onExportMap} style={styles.navRow}>
        <MapIcon size={18} color={theme.mutedForeground} />
        <Text style={styles.navRowLabel}>{t("tripActions.exportMap")}</Text>
      </Pressable>
      <Pressable onPress={() => void onExportExpenses()} style={styles.navRow}>
        <WalletIcon size={18} color={theme.mutedForeground} />
        <Text style={styles.navRowLabel}>{t("tripActions.exportExpenses")}</Text>
      </Pressable>

      {/* ピン画像の焼き付け（画面には出ない）。焼き上がったら zip にして共有。 */}
      {pendingKmz && (
        <PinPngRenderer
          needs={pendingKmz.needs}
          onReady={(files) =>
            void writeKmz(pendingKmz.marks, pendingKmz.styles, files)
          }
        />
      )}
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
