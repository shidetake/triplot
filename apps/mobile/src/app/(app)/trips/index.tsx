import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect, useId } from "react";
import { useLocale, useTranslations } from "use-intl";

import {
  fetchUnassignedDrafts,
  fetchUnassignedInboundCount,
} from "@triplot/shared/data/reads/inbox";
import {
  deriveTripProposals,
  tripProposalDefaults,
} from "@triplot/shared/import/tripProposal";
import {
  fetchMyTrips,
  fetchUserProfile,
} from "@triplot/shared/data/reads/trips";

import { HeaderAccountButtons } from "@/components/header-account-buttons";
import { InboxIcon, PlusIcon } from "@/components/icons";
import { formatTripDateRange } from "@triplot/shared/ymd";

import { usePullRefresh } from "@/lib/usePullRefresh";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// 旅行一覧（アプリのホーム）。web の apps/web/app/trips/page.tsx 相当。
// ヘッダー右に受信箱と設定（アバター）、右下 FAB に旅行作成。取り込み・
// 設定・旅行作成は native の formSheet ルート（trips/inbox・trips/settings・
// trips/new）へ router.push で遷移する（(app)/_layout.tsx 参照）。
export default function TripsScreen() {
  const t = useTranslations("trips");
  const tCommon = useTranslations("common");
  const tHeader = useTranslations("header");
  const tSettings = useTranslations("settings");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const locale = useLocale();
  const { session } = useSession();
  const userId = session?.user.id;

  const {
    data,
    error,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["trips", userId],
    queryFn: () => fetchMyTrips(supabase, userId!),
    enabled: !!userId,
  });

  const trips = data?.trips ?? [];

  // 旅行の候補（仮旅行）。まだ作っていない旅行の証拠になる未割り当ての
  // 下書き（移動・宿泊）を日付でまとめたもの。web の trips/page.tsx と
  // 同じ shared の導出を使う。
  const { data: unassigned } = useQuery({
    queryKey: ["unassignedDrafts", userId],
    queryFn: () => fetchUnassignedDrafts(supabase, userId!),
    enabled: !!userId,
  });
  const proposals = deriveTripProposals(unassigned ?? null).map((p) => ({
    ...tripProposalDefaults(p),
    emailIds: p.emailIds,
  }));

  // メールの取り込みはサーバー側の非同期処理で終わるので、クライアントの操作に
  // 紐づく再取得では拾えない（転送したのにアプリを再起動するまで出てこない）。
  // 旅行詳細の useTripDrafts と同じ Realtime 購読を、一覧では「自分宛の
  // inbound_emails 全部」に対して張る（未割り当ての行は trip_id が null なので
  // trip_id では絞れない）。RLS が効くので他ユーザーの行は流れない。
  // チャンネル名を useId() で一意にするのも同じ理由（同名の二重 subscribe が
  // 実機でクラッシュした事例に倣う）。
  const qc = useQueryClient();
  const instanceId = useId();
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`inbound_emails:user:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbound_emails",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["unassignedDrafts", userId] });
          void qc.invalidateQueries({ queryKey: ["inboxCount", userId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, instanceId, qc]);

  // 引っ張り更新は旅行と候補の両方を取り直す。
  const { refreshing, onRefresh } = usePullRefresh(async () => {
    await Promise.all([
      refetch(),
      qc.refetchQueries({ queryKey: ["unassignedDrafts", userId] }),
    ]);
  });

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

  return (
    <View style={styles.container}>
      {/* タイトル（triplot・ラージタイトル）は (app)/_layout.tsx で静的に宣言。
          ここは動的な headerRight（受信箱バッジ）だけ注入する。旅行追加は
          ヘッダーではなく右下 FAB（予定/費用タブと同じ「追加はいつも右下」）。 */}
      <Stack.Screen
        options={{ headerRight: () => <HeaderAccountButtons /> }}
      />
      {/* 空・エラーの文言も FlatList の中（ListEmptyComponent）に置く。外の
          素の <Text> だとラージタイトルヘッダーのインセット
          （contentInsetAdjustmentBehavior）が効かず、ステータスバーの裏
          （ヘッダーの下）に描かれてしまう（実機で発生）。 */}
      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        // 候補は実在の旅行の前（＝一覧の先頭）に置く。まだ作っていない旅行が
        // あることに気付かせるのが目的なので、下に埋もれると意味がない。
        ListHeaderComponent={
          proposals.length > 0 ? (
            <View style={styles.proposals}>
              <Text style={styles.proposalHeading}>
                {t("proposal", { count: proposals.length })}
              </Text>
              <View>
              {proposals.map((p, i) => (
                <Pressable
                  key={p.emailIds.join(",")}
                  style={[styles.proposalRow, i > 0 && styles.proposalDivider]}
                  onPress={() =>
                    router.push({
                      pathname: "/trips/new",
                      params: {
                        ...(p.title ? { title: p.title } : {}),
                        start: p.startDate,
                        end: p.endDate,
                        emails: p.emailIds.join(","),
                      },
                    })
                  }
                >
                  <Text style={styles.cardTitle}>
                    {p.title ??
                      formatTripDateRange(p.startDate, p.endDate, locale)}
                  </Text>
                  <Text style={styles.cardSub}>
                    {formatTripDateRange(p.startDate, p.endDate, locale)}
                  </Text>
                </Pressable>
              ))}
              </View>
            </View>
          ) : null
        }
        // ラージタイトル（iOS）配下でヘッダー高さぶんインセットを自動調整し、
        // スクロールでタイトルが縮む標準挙動を効かせる。
        contentInsetAdjustmentBehavior="automatic"
        // 取り込みは Realtime で反映されるが、接続が切れている時の保険として
        // 手動の更新も置く（世の中どおりの引っ張り更新）。
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <Pressable
            // 一覧全体で1つの枠に見せる。FlatList なので枠を張る親を挟めず、
            // 行ごとに左右の枠を持たせ、先頭に上辺と上の角丸、末尾に下辺と
            // 下の角丸を足して1枚の箱にする。間は区切り線だけ。
            style={[
              styles.row,
              index === 0 && styles.rowFirst,
              index === trips.length - 1 && styles.rowLast,
            ]}
            onPress={() => router.push(`/trips/${item.id}`)}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSub}>
              {formatTripDateRange(item.start_date, item.end_date, locale)}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          error || data?.error ? (
            // 引っ張り更新は付けていない（下のコメント参照）ため、失敗時に
            // フォアグラウンド復帰以外で再試行する手段が無かった（実機
            // フィードバック: JWT の一時的なクロックスキュー等で失敗した時、
            // アプリを強制終了するまで詰んで見えた）。ボタンで明示的に
            // refetch できるようにする。
            <View style={styles.errorBox}>
              <Text style={styles.error}>
                {tCommon("loadError", {
                  message: String(data?.error?.message ?? error),
                })}
              </Text>
              <Pressable
                onPress={() => void refetch()}
                disabled={isRefetching}
                style={[styles.retryButton, isRefetching && styles.disabled]}
              >
                <Text style={styles.retryButtonText}>{tCommon("retry")}</Text>
              </Pressable>
            </View>
          ) : !isLoading ? (
            <Text style={styles.empty}>{t("empty")}</Text>
          ) : null
        }
      />

      {/* 追加 FAB（予定/費用タブと同じ位置・同じ見た目） */}
      <Pressable
        style={styles.fab}
        accessibilityLabel={t("create")}
        onPress={() => router.push("/trips/new")}
      >
        <PlusIcon size={24} color={theme.primaryForeground} />
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  list: { padding: 16 },
  // 同種の項目が並ぶ一覧なので、1件ずつ枠＋隙間ではなく一覧全体を1つの枠に
  // して行を区切り線で分ける（ui-guidelines「行にするかカードにするか」。
  // 費用一覧・受信箱と同じ形）。
  row: {
    padding: 16,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: t.fgAlpha(0.1),
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  // 候補は「まだ存在しない旅行」＝実在の旅行とは別のまとまりなので、
  // 境目を空ける（ui-guidelines「カードや行を縦に並べる時の間隔」）。
  // 旅行の候補（仮旅行）。仮のものは破線・色なしで、群の見出し＋区切り線の行
  // ＝費用の「未確定の取り込み」と同じ形（1件ずつ破線カードにすると、候補が
  // 増えたとき見出しが件数ぶん繰り返される）。
  proposals: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: t.fgAlpha(0.2),
    borderRadius: 6,
    padding: 16,
    gap: 8,
    marginBottom: 24,
  },
  proposalHeading: { fontSize: 12, color: t.mutedForeground },
  proposalRow: { paddingVertical: 10 },
  proposalDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.fgAlpha(0.1),
  },
  // 破線＝「ここに追加できる」（ui-guidelines）。実線にすると既に存在する
  // 旅行に見えてしまう。
  cardTitle: { fontSize: 14, fontWeight: "500", color: t.foreground },
  cardSub: { marginTop: 4, fontSize: 12, color: t.mutedForeground },
  empty: { padding: 24, fontSize: 14, color: t.mutedForeground },
  errorBox: { padding: 24, gap: 12, alignItems: "flex-start" },
  error: { fontSize: 14, color: t.destructiveText },
  retryButton: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.fgAlpha(0.2),
    alignItems: "center",
    justifyContent: "center",
  },
  retryButtonText: { fontSize: 14, fontWeight: "500", color: t.foreground },
  disabled: { opacity: 0.5 },
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
