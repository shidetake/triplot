import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocale, useTranslations } from "use-intl";

import { buildCopySourceLabels } from "@triplot/shared/copySourceLabel";
import { assignInboundEmailTrip } from "@triplot/shared/data/inbox";
import {
  fetchImportInboxRows,
  fetchUnassignedDrafts,
} from "@triplot/shared/data/reads/inbox";
import {
  deriveTripProposals,
  tripProposalDefaults,
} from "@triplot/shared/import/tripProposal";
import { formatTripDateRange } from "@triplot/shared/ymd";

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
  const locale = useLocale();
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

  // 旅行が1つも無いと、この一覧は空のまま何も選べない行き止まりになる。
  // そのメールが旅行の候補（仮旅行）に含まれているなら、「新規旅行として
  // 扱われる」ことをここでも示す。押せる行にはしない — 作成は旅行一覧の
  // 候補カードから行う（ここから旅行作成シートへ push すると、作成後の
  // router.replace でこのシートの積み方が壊れる）。
  const { data: unassigned } = useQuery({
    queryKey: ["unassignedDrafts", userId],
    queryFn: () => fetchUnassignedDrafts(supabase, userId!),
    enabled: !!userId,
  });
  const found = deriveTripProposals(unassigned ?? null).find((p) =>
    p.emailIds.includes(emailId),
  );
  // 日程・名前は旅行一覧の候補カードと同じ導出を通す（生の値を出すと、
  // 「最低1泊を見込む」補正のぶんカードと期間が食い違って見える）。
  const proposal = found ? tripProposalDefaults(found) : null;

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
      {proposal && (
        <View style={styles.row}>
          <View style={styles.newTripText}>
            <Text style={styles.rowLabel}>
              {proposal.title
                ? `${t("newTrip")}: ${proposal.title}`
                : t("newTrip")}
            </Text>
            <Text style={styles.newTripSub}>
              {formatTripDateRange(
                proposal.startDate,
                proposal.endDate,
                locale,
              )}
              {" · "}
              {t("newTripHint")}
            </Text>
          </View>
        </View>
      )}
      {trips.length === 0 && !proposal && (
        <Text style={styles.empty}>{t("noTripsToAssign")}</Text>
      )}
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
    rowLabel: { flex: 1, fontSize: 14, color: t.foreground },
    newTripText: { flex: 1, gap: 2 },
    newTripSub: { fontSize: 12, color: t.mutedForeground },
    empty: { padding: 16, fontSize: 14, color: t.mutedForeground },
    rowLabelSelected: { fontWeight: "600" },
  });
