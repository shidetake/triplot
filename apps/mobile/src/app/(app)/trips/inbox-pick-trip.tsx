import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useTranslations } from "use-intl";

import { buildCopySourceLabels } from "@triplot/shared/copySourceLabel";
import { assignInboundEmailTrip } from "@triplot/shared/data/inbox";
import { fetchImportInboxRows } from "@triplot/shared/data/reads/inbox";

import { CheckIcon } from "@/components/icons";
import { SheetTitle } from "@/components/sheet-title";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useSession } from "@/lib/session";

// 取り込み下書きの旅行割当（native formSheet ルート。受信箱の formSheet の
// 上にドリルインで重なる — [tripId]/edit → categories と同じ「兄弟ルートへ
// router.push」パターン）。行の見た目は places.tsx の場所フィルタ（priorityRow）
// と同形で揃える。
export default function InboxPickTripRoute() {
  const { emailId } = useLocalSearchParams<{ emailId: string }>();
  const t = useTranslations("import");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["inbox", userId],
    queryFn: () => fetchImportInboxRows(supabase, userId!),
    enabled: !!userId,
  });
  const trips = data?.trips ?? [];
  const currentTripId = data?.emails?.find((e) => e.id === emailId)?.trip_id;
  // 同名旅行を見分けやすいよう "Hawaii (2026, 7日間)" の形にする
  // （create-trip のコピー元選択と同じ関数）。
  const tripLabels = buildCopySourceLabels(trips);

  const pick = async (tripId: string) => {
    const r = await assignInboundEmailTrip(supabase, emailId, tripId);
    if (!r.ok) {
      Alert.alert(r.error);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["inbox", userId] });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SheetTitle>{t("selectTripPrompt")}</SheetTitle>
      {trips.map((tr) => {
        const selected = tr.id === currentTripId;
        return (
          <Pressable
            key={tr.id}
            onPress={() => void pick(tr.id)}
            style={[styles.row, selected && styles.rowSelected]}
          >
            <Text
              style={[styles.rowLabel, selected && styles.rowLabelSelected]}
            >
              {tripLabels.get(tr.id) ?? tr.title}
            </Text>
            {selected && (
              <CheckIcon size={16} color={theme.mutedForeground} />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { paddingBottom: 24 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.08),
    },
    rowSelected: { backgroundColor: t.secondary },
    rowLabel: { flex: 1, fontSize: 15, color: t.foreground },
    rowLabelSelected: { fontWeight: "600" },
  });
