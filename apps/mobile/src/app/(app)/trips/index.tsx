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

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t("heading"),
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Link href="/inbox" asChild>
                <Pressable hitSlop={8} accessibilityLabel="取り込み">
                  <InboxIcon size={20} color="rgba(0,0,0,0.7)" />
                </Pressable>
              </Link>
              <Link href="/trips/new" asChild>
                <Pressable hitSlop={8} accessibilityLabel={t("create")}>
                  <PlusIcon size={20} color="rgba(0,0,0,0.7)" />
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
  headerButtons: { flexDirection: "row", alignItems: "center", gap: 16 },
});
