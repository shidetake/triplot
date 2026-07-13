import DateTimePicker from "@react-native-community/datetimepicker";
import { router, Stack } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import { COMMON_CURRENCIES } from "@triplot/shared/currencies";
import { regenerateTripInvite } from "@triplot/shared/data/invites";
import {
  removeTripMember,
  updateMyMemberName,
} from "@triplot/shared/data/members";
import { deleteTrip, updateTrip } from "@triplot/shared/data/trips";
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

import { MemberAvatar } from "@/components/member-avatar";
import {
  ChevronIcon,
  MapIcon,
  TagIcon,
  TrashIcon,
  WalletIcon,
} from "@/components/icons";
import { exportFileViaShareSheet, safeFilename } from "@/lib/exportFile";
import { generateInviteToken } from "@/lib/inviteToken";
import { shareTripInvite } from "@/lib/shareTripInvite";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useSession } from "@/lib/session";
import { useInvalidateTrip, useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// 旅行の編集・メンバー・招待・削除（モーダル）。web の TripActions ＋
// members ページの機能を1画面に集約した RN 版。
export default function EditTripScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tripId = useTripId();
  const t = useTranslations();
  const { session } = useSession();
  const { data, me, refetch } = useTripDetail(tripId);
  const invalidate = useInvalidateTrip(tripId);

  const trip = data?.trip;
  const [title, setTitle] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!trip || !me) return null;
  const isAdmin = me.is_admin;

  const vTitle = title ?? trip.title;
  const vStart = startDate ?? trip.start_date ?? todayStr();
  const vEnd = endDate ?? trip.end_date ?? vStart;
  const vCurrency = currency ?? (trip.default_currency as Currency);
  const vMyName = myName ?? me.display_name;

  const members = data.members ?? [];

  const saveTrip = async () => {
    setBusy(true);
    setError(null);
    // 旅行情報（admin のみ）と自分の表示名を保存。
    if (isAdmin) {
      const r = await updateTrip(supabase, tripId, {
        title: vTitle.trim(),
        startDate: vStart,
        endDate: vEnd < vStart ? vStart : vEnd,
        currency: vCurrency,
      });
      if (!r.ok) {
        setBusy(false);
        setError(r.error);
        return;
      }
    }
    if (vMyName.trim() && vMyName.trim() !== me.display_name) {
      const r = await updateMyMemberName(
        supabase,
        tripId,
        session!.user.id,
        vMyName.trim(),
      );
      if (!r.ok) {
        setBusy(false);
        setError(r.error);
        return;
      }
    }
    setBusy(false);
    void invalidate();
    router.back();
  };

  const regenerateInvite = () => {
    Alert.alert(
      t("tripActions.regenerateTitle"),
      t("tripActions.regenerateBody"),
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: t("tripActions.regenerateConfirm"),
          style: "destructive",
          onPress: () => {
            void regenerateTripInvite(
              supabase,
              tripId,
              generateInviteToken(),
            ).then((r) => {
              if (!r.ok) Alert.alert(r.error);
            });
          },
        },
      ],
    );
  };

  const confirmRemoveMember = (memberId: string, name: string) => {
    Alert.alert(t("members.removeTitle", { name }), undefined, [
      { text: "キャンセル", style: "cancel" },
      {
        text: t("members.remove"),
        style: "destructive",
        onPress: () => {
          void removeTripMember(supabase, memberId).then((r) => {
            if (!r.ok) {
              Alert.alert(t("members.removeFailed", { error: r.error }));
              return;
            }
            void refetch();
          });
        },
      },
    ]);
  };

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
      data.trip!.default_timezone,
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

  const confirmDeleteTrip = () => {
    Alert.alert(
      t("tripActions.deleteTripTitle"),
      t("tripActions.deleteTripBody"),
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: t("tripActions.deleteTrip"),
          style: "destructive",
          onPress: () => {
            void deleteTrip(supabase, tripId, session!.user.id).then((r) => {
              if (!r.ok) {
                Alert.alert(r.error);
                return;
              }
              router.dismissAll();
              router.replace("/trips");
            });
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: t("tripActions.editTrip"),
          presentation: "modal",
        }}
      />

      {/* 旅行情報（admin 以外は読み取りのみ）。タイトルはラベル無し＋
          placeholder＝フィールド名（iOS カレンダー方式）。 */}
      <TextInput
        value={vTitle}
        onChangeText={setTitle}
        editable={isAdmin}
        placeholder={t("createTrip.title")}
        accessibilityLabel={t("createTrip.title")}
        style={[styles.input, !isAdmin && styles.inputDisabled]}
      />

      <View>
        <Text style={styles.label}>{t("createTrip.dates")}</Text>
        <View style={styles.dateRow}>
          <DateTimePicker
            value={new Date(`${vStart}T12:00:00`)}
            mode="date"
            display="compact"
            disabled={!isAdmin}
            onChange={(_, d) => {
              if (d) setStartDate(fmtDate(d));
            }}
          />
          <Text style={styles.dateSep}>→</Text>
          <DateTimePicker
            value={new Date(`${vEnd}T12:00:00`)}
            mode="date"
            display="compact"
            disabled={!isAdmin}
            minimumDate={new Date(`${vStart}T12:00:00`)}
            onChange={(_, d) => {
              if (d) setEndDate(fmtDate(d));
            }}
          />
        </View>
      </View>

      <View>
        <Text style={styles.label}>{t("createTrip.settlementCurrency")}</Text>
        <View style={styles.currencyWrap}>
          {currencyChoices(vCurrency).map((c) => (
            <Pressable
              key={c}
              disabled={!isAdmin}
              onPress={() => setCurrency(c)}
              style={[
                styles.currencyChip,
                vCurrency === c && styles.currencyChipOn,
              ]}
            >
              <Text
                style={[
                  styles.currencyText,
                  vCurrency === c && styles.currencyTextOn,
                ]}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </View>
        {isAdmin && (
          <Text style={styles.warn}>{t("tripDetail.rateChangeWarning")}</Text>
        )}
      </View>

      {/* メンバー */}
      <View>
        <Text style={styles.sectionTitle}>{t("members.heading")}</Text>
        {members.map((m) => {
          const isMe = m.id === me.id;
          return (
            <View key={m.id} style={styles.memberRow}>
              <MemberAvatar
                member={{
                  id: m.id,
                  display_name: m.display_name,
                  color: m.color,
                  avatarUrl: m.users?.avatar_url ?? null,
                }}
                size={24}
              />
              {isMe ? (
                <TextInput
                  value={vMyName}
                  onChangeText={setMyName}
                  style={[styles.input, styles.memberNameInput]}
                />
              ) : (
                <Text style={styles.memberName}>{m.display_name}</Text>
              )}
              {m.is_admin && (
                <Text style={styles.adminBadge}>{t("members.admin")}</Text>
              )}
              {isAdmin && !isMe && (
                <Pressable
                  onPress={() => confirmRemoveMember(m.id, m.display_name)}
                  hitSlop={8}
                  accessibilityLabel={t("members.removeAria", {
                    name: m.display_name,
                  })}
                >
                  <TrashIcon size={16} color={theme.subtleForeground} />
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {/* 招待 */}
      <View>
        <Text style={styles.sectionTitle}>{t("tripActions.share")}</Text>
        <Text style={styles.hint}>{t("tripActions.shareDesc")}</Text>
        <View style={styles.inviteRow}>
          <Pressable
            onPress={() => void shareTripInvite(tripId)}
            style={styles.outlineButton}
          >
            <Text style={styles.outlineLabel}>共有リンクを送る</Text>
          </Pressable>
          <Pressable onPress={regenerateInvite} style={styles.outlineButton}>
            <Text style={styles.outlineLabel}>
              {t("tripActions.regenerateConfirm")}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 管理・エクスポート（iOS 設定流のドリルイン/アクション行。
          web の ⋯ メニューのカテゴリ管理・エクスポートに対応） */}
      <View style={styles.navList}>
        <Pressable
          onPress={() => router.push(`/trips/${tripId}/categories`)}
          style={styles.navRow}
        >
          <TagIcon size={18} color={theme.mutedForeground} />
          <Text style={styles.navRowLabel}>{t("categories.heading")}</Text>
          <ChevronIcon size={16} color={theme.subtleForeground} />
        </Pressable>
        <Pressable onPress={() => void onExportMap()} style={styles.navRow}>
          <MapIcon size={18} color={theme.mutedForeground} />
          <Text style={styles.navRowLabel}>{t("tripActions.exportMap")}</Text>
        </Pressable>
        <Pressable
          onPress={() => void onExportExpenses()}
          style={styles.navRow}
        >
          <WalletIcon size={18} color={theme.mutedForeground} />
          <Text style={styles.navRowLabel}>
            {t("tripActions.exportExpenses")}
          </Text>
        </Pressable>
      </View>

      {/* 保存 */}
      <Pressable
        onPress={() => void saveTrip()}
        disabled={busy}
        style={[styles.submitButton, busy && styles.disabled]}
      >
        <Text style={styles.submitLabel}>{busy ? "保存中..." : "保存"}</Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      {/* 旅行削除（admin のみ・最下部） */}
      {isAdmin && (
        <Pressable onPress={confirmDeleteTrip} style={styles.deleteTripButton}>
          <Text style={styles.deleteTripLabel}>
            {t("tripActions.deleteTrip")}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// 現在の通貨が主要6通貨に無ければ先頭に足して選択肢に含める。
function currencyChoices(current: Currency): Currency[] {
  const base = COMMON_CURRENCIES.slice(0, 6);
  return base.includes(current) ? base : [current, ...base.slice(0, 5)];
}

function todayStr(): string {
  return fmtDate(new Date());
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
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 4, color: t.foreground },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8, color: t.foreground },
  hint: { fontSize: 12, color: t.mutedForeground, marginBottom: 8 },
  warn: { fontSize: 11, color: t.warnAccent, marginTop: 6 },
  input: {
    height: 36,
    borderWidth: 1,
    borderColor: t.fgAlpha(0.2),
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    color: t.foreground,
  },
  inputDisabled: { opacity: 0.5 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateSep: { fontSize: 14, color: t.subtleForeground },
  currencyWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  currencyChip: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.fgAlpha(0.2),
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  currencyChipOn: { backgroundColor: t.primary, borderColor: t.primary },
  currencyText: { fontSize: 13, color: t.foreground },
  currencyTextOn: { color: t.primaryForeground },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.fgAlpha(0.08),
  },
  memberName: { flex: 1, fontSize: 14, color: t.foreground },
  memberNameInput: { flex: 1 },
  adminBadge: {
    fontSize: 11,
    color: t.mutedForeground,
    backgroundColor: t.fgAlpha(0.06),
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  inviteRow: { flexDirection: "row", gap: 8 },
  // iOS 設定流の行リスト（ドリルイン・アクション）。
  navList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.fgAlpha(0.08),
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.fgAlpha(0.08),
  },
  navRowLabel: { flex: 1, fontSize: 14, color: t.foreground },
  outlineButton: {
    flex: 1,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.fgAlpha(0.2),
    alignItems: "center",
    justifyContent: "center",
  },
  outlineLabel: { fontSize: 13, fontWeight: "500", color: t.foreground },
  submitButton: {
    height: 44,
    borderRadius: 6,
    backgroundColor: t.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitLabel: { color: t.primaryForeground, fontSize: 15, fontWeight: "500" },
  disabled: { opacity: 0.5 },
  deleteTripButton: {
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.destructiveBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  deleteTripLabel: { fontSize: 13, color: t.destructiveText, fontWeight: "500" },
  error: {
    fontSize: 13,
    color: t.errorText,
    backgroundColor: t.errorBg,
    borderRadius: 6,
    padding: 10,
  },
});
