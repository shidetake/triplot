import { useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useRef } from "react";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocale, useTranslations } from "use-intl";

import {
  fetchImportInboxRows,
  fetchUnassignedInboundCount,
} from "@triplot/shared/data/reads/inbox";
import {
  fetchMyTrips,
  fetchUserProfile,
} from "@triplot/shared/data/reads/trips";

import { FeedbackSheet } from "@/components/feedback-sheet";
import { FormSheet, type FormSheetRef } from "@/components/form-sheet";
import { HeaderIconButton } from "@/components/header-icon-button";
import { InboxIcon, PlusIcon } from "@/components/icons";
import { InboxSheet } from "@/components/inbox-sheet";
import { NewTripSheet } from "@/components/new-trip-sheet";
import { SettingsSheet } from "@/components/settings-sheet";
import { formatTripDateRange } from "@triplot/shared/ymd";

import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { usePullRefresh } from "@/lib/usePullRefresh";

// 旅行一覧（アプリのホーム）。web の apps/web/app/trips/page.tsx 相当。
// ヘッダー右に旅行作成（+）と設定（歯車）。取り込み・設定・旅行作成は
// すべて @gorhom ベースの FormSheet（予定/費用/場所のフォームと同じ実装）
// で開く。旅行編集・カテゴリ管理等の旅行詳細系シートと合わせてアプリ全体で
// 1つのシート実装に統一している（native の formSheet とカスタムシートを
// 画面ごとに使い分けると、ユーザーには理由の分からない質感の違いとして
// 違和感になるため）。
export default function TripsScreen() {
  const t = useTranslations("trips");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const locale = useLocale();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data, error, isLoading } = useQuery({
    queryKey: ["trips", userId],
    queryFn: () => fetchMyTrips(supabase, userId!),
    enabled: !!userId,
  });

  const trips = data?.trips ?? [];

  // 受信箱バッジ: まだ旅行に割り当てていない下書きの件数（要割当）。web の
  // AppHeader と同じ shared read。
  const { data: inboxCount } = useQuery({
    queryKey: ["inboxCount", userId],
    queryFn: () => fetchUnassignedInboundCount(supabase, userId!),
    enabled: !!userId,
  });

  // ヘッダー右のアバター（web の AppHeader 右上のアバターと同じ「自分の
  // アカウント」の入口＝タップで設定シート）。queryKey は設定シートと同じ
  // なのでキャッシュ共有され、アバター変更が即ここにも反映する。
  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => fetchUserProfile(supabase, userId!),
    enabled: !!userId,
  });
  const avatarInitial =
    (profile?.display_name ?? session?.user.email ?? "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?";

  // 受信箱シートの pull-to-refresh。InboxSheet 本体と同じ queryKey で
  // 呼ぶことで TanStack Query のキャッシュ共有により二重取得にはならず、
  // ここでの refetch が InboxSheet の data も更新する（RefreshControl は
  // ScrollView 直下の prop としてしか機能しないため FormSheet 側に渡す）。
  const { refetch: refetchInbox } = useQuery({
    queryKey: ["inbox", userId],
    queryFn: () => fetchImportInboxRows(supabase, userId!),
    enabled: !!userId,
  });
  const { refreshing: inboxRefreshing, onRefresh: onInboxRefresh } =
    usePullRefresh(refetchInbox);

  const inboxRef = useRef<FormSheetRef>(null);
  const settingsRef = useRef<FormSheetRef>(null);
  const newTripRef = useRef<FormSheetRef>(null);
  const feedbackRef = useRef<FormSheetRef>(null);

  return (
    <View style={styles.container}>
      {/* タイトル（triplot・ラージタイトル）は (app)/_layout.tsx で静的に宣言。
          ここは動的な headerRight（受信箱バッジ）だけ注入する。旅行追加は
          ヘッダーではなく右下 FAB（予定/費用タブと同じ「追加はいつも右下」）。 */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerButtons}>
              <HeaderIconButton
                accessibilityLabel="取り込み"
                onPress={() => inboxRef.current?.present()}
              >
                <View>
                  <InboxIcon size={20} color={theme.mutedForeground} />
                  {(inboxCount ?? 0) > 0 && (
                    <View style={styles.inboxBadge}>
                      <Text style={styles.inboxBadgeText}>
                        {(inboxCount ?? 0) > 9 ? "9+" : inboxCount}
                      </Text>
                    </View>
                  )}
                </View>
              </HeaderIconButton>
              {/* アバター＝アカウント（設定）の入口。web の右上アバターと同じ。
                  自分のアバターは中立 zinc（メンバー色 hue とは別系統）。 */}
              <HeaderIconButton
                accessibilityLabel="設定"
                onPress={() => settingsRef.current?.present()}
              >
                {profile?.avatar_url ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={styles.headerAvatar}
                  />
                ) : (
                  <View style={styles.headerAvatarFallback}>
                    <Text style={styles.headerAvatarInitial}>
                      {avatarInitial}
                    </Text>
                  </View>
                )}
              </HeaderIconButton>
            </View>
          ),
        }}
      />
      {error || data?.error ? (
        <Text style={styles.error}>
          {t("loadError", {
            message: String(data?.error?.message ?? error),
          })}
        </Text>
      ) : trips.length === 0 && !isLoading ? (
        <Text style={styles.empty}>{t("empty")}</Text>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          // ラージタイトル（iOS）配下でヘッダー高さぶんインセットを自動調整し、
          // スクロールでタイトルが縮む標準挙動を効かせる。
          // 引っ張り更新は付けない: ラージタイトルとの組み合わせで1回更新すると
          // 二度と引けなくなる不具合（実機）があり、フォーカス時の自動再取得と
          // 操作後の invalidate で足りるため撤去（挙動の一貫性優先）。
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/trips/${item.id}`)}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSub}>
                {formatTripDateRange(item.start_date, item.end_date, locale)}
              </Text>
            </Pressable>
          )}
        />
      )}

      {/* 追加 FAB（予定/費用タブと同じ位置・同じ見た目） */}
      <Pressable
        style={styles.fab}
        accessibilityLabel={t("create")}
        onPress={() => newTripRef.current?.present()}
      >
        <PlusIcon size={24} color={theme.primaryForeground} />
      </Pressable>

      <FormSheet
        ref={inboxRef}
        sizeToContent
        refreshControl={
          <RefreshControl
            refreshing={inboxRefreshing}
            onRefresh={onInboxRefresh}
          />
        }
      >
        {() => <InboxSheet />}
      </FormSheet>
      <FormSheet ref={settingsRef} sizeToContent>
        {(dismiss) => (
          <SettingsSheet
            onDone={dismiss}
            onOpenFeedback={() => feedbackRef.current?.present()}
          />
        )}
      </FormSheet>
      {/* フィードバックは設定からのドリルイン＝push で設定の上に重ねる
          （旅行編集→カテゴリ管理と同じ）。送信成功でトースト代わりに
          フィードバックシートだけ閉じ、設定に戻る。 */}
      <FormSheet ref={feedbackRef} sizeToContent stackBehavior="push">
        {(dismiss) => <FeedbackSheet onDone={dismiss} />}
      </FormSheet>
      <FormSheet ref={newTripRef} sizeToContent>
        {(dismiss) => <NewTripSheet onDone={dismiss} />}
      </FormSheet>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  list: { padding: 16, gap: 8 },
  card: {
    borderWidth: 1,
    borderColor: t.fgAlpha(0.1),
    borderRadius: 6,
    padding: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: "500", color: t.foreground },
  cardSub: { marginTop: 4, fontSize: 13, color: t.mutedForeground },
  empty: { padding: 24, fontSize: 14, color: t.mutedForeground },
  error: { padding: 24, fontSize: 14, color: t.destructiveText },
  // グリフ間の見た目の間隔 = gap + 両ボタンの padding(10×2) ≒ 28 を維持。
  headerButtons: { flexDirection: "row", alignItems: "center", gap: 8 },
  // ヘッダーのアバター（24px 丸。ナビアイコンの 24 と同段）。
  headerAvatar: { width: 24, height: 24, borderRadius: 12 },
  headerAvatarFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: t.fgAlpha(0.1),
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarInitial: {
    fontSize: 12,
    fontWeight: "500",
    color: t.mutedForeground,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  // 受信箱の件数バッジ（web の AppHeader と同じ primary 塗り＋白縁）。
  inboxBadge: {
    position: "absolute",
    top: -5,
    right: -7,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: t.primary,
    borderWidth: 1,
    borderColor: t.background,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxBadgeText: { fontSize: 9, fontWeight: "600", color: t.primaryForeground },
});
