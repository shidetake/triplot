import { useQuery } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocale, useTranslations } from "use-intl";

import { fetchMyTrips } from "@triplot/shared/data/reads/trips";
import { fetchUnassignedInboundCount } from "@triplot/shared/data/reads/inbox";

import { InboxIcon, PlusIcon, SettingsIcon } from "@/components/icons";
import { formatTripDateRange } from "@triplot/shared/ymd";

import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

// 旅行一覧（アプリのホーム）。web の apps/web/app/trips/page.tsx 相当。
// ヘッダー右に旅行作成（+）と設定（歯車）。
export default function TripsScreen() {
  const t = useTranslations("trips");
  const locale = useLocale();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data, error, isLoading, refetch, isRefetching } = useQuery({
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

  return (
    <View style={styles.container}>
      {/* タイトル（triplot・ラージタイトル）は (app)/_layout.tsx で静的に宣言。
          ここは動的な headerRight（受信箱バッジ）だけ注入する。旅行追加は
          ヘッダーではなく右下 FAB（予定/費用タブと同じ「追加はいつも右下」）。 */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Link href="/inbox" asChild>
                <Pressable hitSlop={8} accessibilityLabel="取り込み">
                  <View>
                    <InboxIcon size={20} color="rgba(0,0,0,0.7)" />
                    {(inboxCount ?? 0) > 0 && (
                      <View style={styles.inboxBadge}>
                        <Text style={styles.inboxBadgeText}>
                          {(inboxCount ?? 0) > 9 ? "9+" : inboxCount}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              </Link>
              <Link href="/settings" asChild>
                <Pressable hitSlop={8} accessibilityLabel="設定">
                  <SettingsIcon size={20} color="rgba(0,0,0,0.7)" />
                </Pressable>
              </Link>
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
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
            />
          }
          renderItem={({ item }) => (
            <Link href={`/trips/${item.id}`} asChild>
              <Pressable style={styles.card}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSub}>
                  {formatTripDateRange(item.start_date, item.end_date, locale)}
                </Text>
              </Pressable>
            </Link>
          )}
        />
      )}

      {/* 追加 FAB（予定/費用タブと同じ位置・同じ見た目） */}
      <Link href="/trips/new" asChild>
        <Pressable style={styles.fab} accessibilityLabel={t("create")}>
          <PlusIcon size={24} color="#fff" />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  list: { padding: 16, gap: 8 },
  card: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 6,
    padding: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: "500" },
  cardSub: { marginTop: 4, fontSize: 13, color: "rgba(0,0,0,0.6)" },
  empty: { padding: 24, fontSize: 14, color: "rgba(0,0,0,0.6)" },
  error: { padding: 24, fontSize: 14, color: "#dc2626" },
  // タップ領域が被らないよう広めに空ける（20px アイコン + hitSlop 8 が
  // 干渉しない下限 = 16 だと視覚的に窮屈だったため 28）。
  headerButtons: { flexDirection: "row", alignItems: "center", gap: 28 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#09090b",
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
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  inboxBadgeText: { fontSize: 9, fontWeight: "600", color: "#fff" },
});
