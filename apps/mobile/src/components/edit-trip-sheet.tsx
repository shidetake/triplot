import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
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
import {
  chipDateText,
  InlineNativePicker,
  PickerChip,
} from "@/components/datetime-field";
import { MemberAvatar } from "@/components/member-avatar";
import {
  ChevronIcon,
  CrownIcon,
  DownloadIcon,
  SaveIcon,
  TagIcon,
  TrashIcon,
} from "@/components/icons";
import { SheetTitle } from "@/components/sheet-title";
import * as Clipboard from "expo-clipboard";

import { generateInviteToken } from "@/lib/inviteToken";
import { JOIN_BASE_URL, shareTripInvite } from "@/lib/shareTripInvite";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useSession } from "@/lib/session";
import { useInvalidateTrip, useTripDetail } from "@/lib/useTripDetail";

// 旅行の編集・メンバー・招待・削除（native formSheet ルートの中身）。web の
// TripActions ＋ members ページの機能を1画面に集約した RN 版。カテゴリ管理・
// エクスポートへは router.push で兄弟ルートへ素直にドリルインする。
export function EditTripSheet({ tripId }: { tripId: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
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
  // 日程の inline カレンダーの開閉（同時に開くのは1つだけ）。
  const [openPicker, setOpenPicker] = useState<"start" | "end" | null>(null);

  if (!trip || !me) return null;
  const isAdmin = me.is_admin;

  const vTitle = title ?? trip.title;
  const vStart = startDate ?? trip.start_date ?? todayStr();
  const vEnd = endDate ?? trip.end_date ?? vStart;
  const vCurrency = currency ?? (trip.default_currency as Currency);
  const vMyName = myName ?? me.display_name;

  const members = data.members ?? [];
  const hasExpenses = (data.expensesRaw ?? []).length > 0;

  // 旅行情報（タイトル・日程・通貨）に変更がある時だけ保存を有効に
  // （web の「変更がある時だけ保存ボタンを有効」規約）。
  const tripDirty =
    vTitle.trim() !== trip.title ||
    vStart !== (trip.start_date ?? vStart) ||
    vEnd !== (trip.end_date ?? vEnd) ||
    vCurrency !== trip.default_currency;

  // 旅行情報（タイトル・日程・通貨）だけを保存する（ボタンはそのブロックの
  // 直下・その場保存でシートは閉じない）。自分の表示名はメンバー行で
  // その場保存＝この保存の対象外。
  const saveTrip = async () => {
    setBusy(true);
    setError(null);
    const r = await updateTrip(supabase, tripId, {
      title: vTitle.trim(),
      startDate: vStart,
      endDate: vEnd < vStart ? vStart : vEnd,
      currency: vCurrency,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    void invalidate();
    // 入力値は見た目が変わらないので成功を通知（web はトースト、RN は Alert）。
    setTitle(null);
    setStartDate(null);
    setEndDate(null);
    setCurrency(null);
    Alert.alert(t("common.saved"));
  };

  // 自分の表示名のその場保存（入力を離れた/確定したタイミング。カテゴリ改名と
  // 同じ blur 保存パターン。以前は画面下部の保存ボタンに相乗りしていて
  // 「何の保存か」が分からなかった）。
  const commitMyName = () => {
    const v = vMyName.trim();
    if (!v || v === me.display_name) return;
    void updateMyMemberName(supabase, tripId, session!.user.id, v).then(
      (r) => {
        if (!r.ok) {
          Alert.alert(r.error);
          return;
        }
        void refetch();
      },
    );
  };

  // 再生成したら新リンクをそのままクリップボードへ（再生成する人は当然
  // 次にコピーして配り直すので、2タップに分けさせない）。
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
            ).then(async (r) => {
              if (!r.ok) {
                Alert.alert(r.error);
                return;
              }
              await Clipboard.setStringAsync(
                `${JOIN_BASE_URL}/join/${r.data.token}`,
              );
              Alert.alert(t("tripActions.regenerateCopied"));
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

  // 自分の退出（web の members ページと同じ。同 RPC で自分相手なら admin 不要）。
  // 退出後はこの旅行が見えなくなるので旅行一覧へ戻る。
  const confirmLeave = () => {
    Alert.alert(t("members.leaveTitle"), t("members.leaveBody"), [
      { text: "キャンセル", style: "cancel" },
      {
        text: t("members.leaveConfirm"),
        style: "destructive",
        onPress: () => {
          void removeTripMember(supabase, me!.id).then((r) => {
            if (!r.ok) {
              Alert.alert(t("members.removeFailed", { error: r.error }));
              return;
            }
            router.dismissAll();
            router.replace("/trips");
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
              // 旅行詳細画面全体から離脱＝画面遷移でシートごと消える。
              router.dismissAll();
              router.replace("/trips");
            });
          },
        },
      ],
    );
  };

  return (
    <View style={styles.content}>
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

      {/* 日程: チップ→直下に inline カレンダー、日付タップ＝確定で閉じる
          （datetime-field の共通方式。旅行作成と同形）。 */}
      <View>
        <Text style={styles.label}>{t("createTrip.dates")}</Text>
        <View style={styles.dateRow}>
          <PickerChip
            text={chipDateText(vStart)}
            active={openPicker === "start"}
            disabled={!isAdmin}
            onPress={() =>
              setOpenPicker((p) => (p === "start" ? null : "start"))
            }
          />
          <Text style={styles.dateSep}>→</Text>
          <PickerChip
            text={chipDateText(vEnd)}
            active={openPicker === "end"}
            disabled={!isAdmin}
            onPress={() => setOpenPicker((p) => (p === "end" ? null : "end"))}
          />
        </View>
        {/* 開始/終了でピッカーを1つ共有（出し分けると切替時にちらつくため）。 */}
        {openPicker != null && (
          <InlineNativePicker
            value={
              openPicker === "start"
                ? new Date(`${vStart}T12:00:00`)
                : new Date(`${vEnd}T12:00:00`)
            }
            mode="date"
            minimumDate={
              openPicker === "end"
                ? new Date(`${vStart}T12:00:00`)
                : undefined
            }
            onChange={(d) => {
              if (openPicker === "start") {
                setStartDate(fmtDate(d));
              } else {
                setEndDate(fmtDate(d));
              }
              setOpenPicker(null);
            }}
          />
        )}
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
        {/* レート再計算されない注意は「費用があり、かつ通貨を実際に変更した
            時だけ」出す（web の edit-trip-form と同じ。常時表示はノイズ）。 */}
        {hasExpenses && vCurrency !== trip.default_currency && (
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

      {/* 旅行情報の保存（対象＝上のタイトル・日程・通貨のみ。入力の直下に置き、
          変更がある時だけ有効にする。メンバーの表示名はメンバー行でその場保存）。 */}
      {isAdmin && (
        <Pressable
          onPress={() => void saveTrip()}
          disabled={busy || !tripDirty}
          accessibilityLabel={t("common.save")}
          style={[
            styles.submitButton,
            (busy || !tripDirty) && styles.disabled,
          ]}
        >
          <SaveIcon size={20} color={theme.primaryForeground} />
        </Pressable>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

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
                  onBlur={commitMyName}
                  onSubmitEditing={commitMyName}
                  returnKeyType="done"
                  style={[styles.input, styles.memberNameInput]}
                />
              ) : (
                <Text style={styles.memberName}>{m.display_name}</Text>
              )}
              {/* 自分の行は「退出」、他人の行は削除（admin のみ）。web の
                  members ページと同じ使い分け（自分の退出に admin は不要）。 */}
              {isMe ? (
                <Pressable
                  onPress={confirmLeave}
                  hitSlop={8}
                  accessibilityLabel={t("members.leaveAction")}
                >
                  <TrashIcon size={16} color={theme.subtleForeground} />
                </Pressable>
              ) : (
                isAdmin && (
                  <Pressable
                    onPress={() => confirmRemoveMember(m.id, m.display_name)}
                    hitSlop={8}
                    accessibilityLabel={t("members.removeAria", {
                      name: m.display_name,
                    })}
                  >
                    <TrashIcon size={16} color={theme.subtleForeground} />
                  </Pressable>
                )
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

      {/* 旅行削除（admin のみ・最下部）。破壊的操作の見分けが早くなるよう
          ゴミ箱アイコンを文字の左に添える（アイコンのみは攻めすぎなので
          テキスト併記のまま）。 */}
      {isAdmin && (
        <Pressable onPress={confirmDeleteTrip} style={styles.deleteTripButton}>
          <TrashIcon size={16} color={theme.destructiveText} />
          <Text style={styles.deleteTripLabel}>
            {t("tripActions.deleteTrip")}
          </Text>
        </Pressable>
      )}
    </View>
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
  content: { paddingHorizontal: 16, gap: 16 },
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
  disabled: { opacity: 0.5 },
  deleteTripButton: {
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.destructiveBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
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
