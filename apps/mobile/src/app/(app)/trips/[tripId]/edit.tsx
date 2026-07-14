import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
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

import { regenerateTripInvite } from "@triplot/shared/data/invites";
import {
  removeTripMember,
  updateMyMemberName,
} from "@triplot/shared/data/members";
import { deleteTrip, updateTrip } from "@triplot/shared/data/trips";
import type { Currency } from "@triplot/shared/types/database";

import { CurrencyPickerModal, CurrencyPickerTrigger } from "@/components/currency-picker";
import { MemberAvatar } from "@/components/member-avatar";
import {
  ChevronIcon,
  CrownIcon,
  DownloadIcon,
  TagIcon,
  TrashIcon,
} from "@/components/icons";
import { SheetTitle } from "@/components/sheet-title";
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
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

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
      <SheetTitle>{t("tripActions.editTrip")}</SheetTitle>

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
        {/* 通貨は web と同じ全170通貨から選べる（以前は6件に絞った独自
            chip 実装だった＝仕様の揺れ）。トリガー＋モーダルは
            CurrencyPickerModal に集約（expense-form と共用）。 */}
        <CurrencyPickerTrigger
          value={vCurrency}
          disabled={!isAdmin}
          onPress={() => setCurrencyPickerOpen(true)}
        />
        {isAdmin && (
          <Text style={styles.warn}>{t("tripDetail.rateChangeWarning")}</Text>
        )}
      </View>

      <CurrencyPickerModal
        visible={currencyPickerOpen}
        value={vCurrency}
        onSelect={setCurrency}
        onClose={() => setCurrencyPickerOpen(false)}
        title={t("createTrip.settlementCurrency")}
      />

      {/* メンバー */}
      <View>
        <Text style={styles.sectionTitle}>{t("members.heading")}</Text>
        {members.map((m) => {
          const isMe = m.id === me.id;
          return (
            <View key={m.id} style={styles.memberRow}>
              {/* 管理者はアバター右上に王冠バッジ（web と同形。テキストの
                  「管理者」ラベルは使わない＝仕様の単一化）。 */}
              <View>
                <MemberAvatar
                  member={{
                    id: m.id,
                    display_name: m.display_name,
                    color: m.color,
                    avatarUrl: m.users?.avatar_url ?? null,
                  }}
                  size={24}
                />
                {m.is_admin && (
                  <View
                    style={styles.crownBadge}
                    accessibilityLabel={t("members.admin")}
                  >
                    <CrownIcon size={10} color="#f59e0b" />
                  </View>
                )}
              </View>
              {isMe ? (
                <TextInput
                  value={vMyName}
                  onChangeText={setMyName}
                  style={[styles.input, styles.memberNameInput]}
                />
              ) : (
                <Text style={styles.memberName}>{m.display_name}</Text>
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
        <Pressable
          onPress={() => router.push(`/trips/${tripId}/export`)}
          style={styles.navRow}
        >
          <DownloadIcon size={18} color={theme.mutedForeground} />
          <Text style={styles.navRowLabel}>{t("tripActions.export")}</Text>
          <ChevronIcon size={16} color={theme.subtleForeground} />
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
  // アバター右上の王冠（14px 丸に 10px の琥珀の王冠。web の管理者バッジと同形）。
  crownBadge: {
    position: "absolute",
    right: -4,
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: t.background,
    alignItems: "center",
    justifyContent: "center",
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
