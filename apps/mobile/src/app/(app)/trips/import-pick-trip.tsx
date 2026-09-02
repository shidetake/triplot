import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
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
import { SheetScroll } from "@/components/sheet-scroll";
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

  // 「新規旅行」= どの旅行にも割り当てない状態。旅行一覧に候補（仮旅行）として
  // 出る。旅行が1つも無いと、この一覧は空のまま何も選べない行き止まりになるので
  // その受け皿でもある。
  //
  // **選べる行にしてある**（割り当てを null に戻す）。既存の旅行を選ぶと候補は
  // 見た目上消えるが、下書きが未確定のうちは元の状態に戻せないと困る
  // （確定してしまえば受信箱から消えるので、この画面自体に来なくなる）。
  //
  // 候補の計算は未割り当ての下書きだけを見るので、既に割り当て済みのこの
  // メールはそのままでは候補に現れない。「割り当てを外したらどうなるか」を
  // 出したいので、自分の下書きを足してから導出する。
  const { data: unassigned } = useQuery({
    queryKey: ["unassignedDrafts", userId],
    queryFn: () => fetchUnassignedDrafts(supabase, userId!),
    enabled: !!userId,
  });
  const myDrafts = (data?.draftRows ?? [])
    .filter((d) => d.email_id === emailId)
    .map((d) => ({ emailId, kind: d.kind, payload: d.payload }));
  const found = deriveTripProposals(
    [...(unassigned ?? []).filter((d) => d.emailId !== emailId), ...myDrafts],
    trips.map((t) => ({ startDate: t.start_date, endDate: t.end_date })),
  ).find((p) => p.emailIds.includes(emailId));
  // 日程・名前は旅行一覧の候補カードと同じ導出を通す（生の値を出すと、
  // 「最低1泊を見込む」補正のぶんカードと期間が食い違って見える）。
  const proposal = found ? tripProposalDefaults(found) : null;

  // tripId が null なら割り当てを外す（＝新規旅行に戻す）。
  const pick = async (tripId: string | null) => {
    const r = await assignInboundEmailTrip(supabase, emailId, tripId);
    if (!r.ok) {
      Alert.alert(r.error);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["inbox", userId] });
    void queryClient.invalidateQueries({
      queryKey: ["unassignedDrafts", userId],
    });
    router.back();
  };

  return (
    <SheetScroll contentContainerStyle={styles.content}>
      <SheetTitle>{t("selectTripPrompt")}</SheetTitle>
      {proposal && (
        <Pressable
          onPress={() => void pick(null)}
          style={[styles.row, !currentTripId && styles.rowSelected]}
        >
          <View style={styles.newTripText}>
            <Text
              style={[
                styles.rowLabel,
                !currentTripId && styles.rowLabelSelected,
              ]}
            >
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
          {!currentTripId && (
            <CheckIcon size={16} color={theme.mutedForeground} />
          )}
        </Pressable>
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
            {selected && <CheckIcon size={16} color={theme.mutedForeground} />}
          </Pressable>
        );
      })}
    </SheetScroll>
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
