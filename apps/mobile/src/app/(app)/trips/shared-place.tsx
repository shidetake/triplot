import { useQuery } from "@tanstack/react-query";
import { useShareIntentContext } from "expo-share-intent";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { buildCopySourceLabels } from "@triplot/shared/copySourceLabel";
import { fetchMyTrips } from "@triplot/shared/data/reads/trips";
import { resolveGoogleMapsShare } from "@triplot/shared/googleMapsShare";

import { SheetScroll } from "@/components/sheet-scroll";
import { SheetTitle } from "@/components/sheet-title";
import { BUNDLE_ID, PLACES_API_KEY } from "@/lib/googlePlaces";
import { replaceOnce } from "@/lib/navigate";
import { putSharedPlace } from "@/lib/sharedPlace";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { type Theme, useThemedStyles } from "@/lib/theme";

// Google マップの「共有」→ triplot で届いた場所を、どの旅行に入れるか選ぶ
// （native formSheet。LINE の共有でトークルームを選ぶのと同じ役目）。
// 選ぶとその旅行の場所タブを開き、場所を選んだ状態にする（候補ピン＋追加
// フォーム。旅行に同じ場所があればそれを開く）。行の見た目は受信箱の
// 旅行割当（import-pick-trip.tsx）と同じ。
export default function SharedPlaceRoute() {
  const t = useTranslations("sharedPlace");
  const styles = useThemedStyles(makeStyles);
  const { session } = useSession();
  const userId = session?.user.id;
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  // 共有の中身は開いた時点のものを持っておく（アプリが裏に回ると
  // ライブラリの側が消すため）。
  const [text] = useState(
    () =>
      [shareIntent.text, shareIntent.webUrl].filter(Boolean).join("\n") ?? "",
  );

  const place = useQuery({
    queryKey: ["sharedPlace", text],
    queryFn: () =>
      resolveGoogleMapsShare(text, {
        apiKey: PLACES_API_KEY,
        iosBundleId: BUNDLE_ID,
      }),
    enabled: !!text && !!PLACES_API_KEY,
    staleTime: Infinity,
  });
  const { data } = useQuery({
    queryKey: ["trips", userId],
    queryFn: () => fetchMyTrips(supabase, userId!),
    enabled: !!userId,
  });
  const trips = data?.trips ?? [];
  const tripLabels = buildCopySourceLabels(trips);
  const candidate = place.data ?? null;

  const pick = (tripId: string) => {
    if (!candidate) return;
    putSharedPlace(candidate);
    resetShareIntent();
    replaceOnce(`/trips/${tripId}/places?sharedPlace=1`);
  };

  return (
    <SheetScroll contentContainerStyle={styles.content}>
      <SheetTitle>{t("title")}</SheetTitle>
      <View style={styles.place}>
        {place.isPending && text ? (
          <Text style={styles.placeSub}>{t("resolving")}</Text>
        ) : candidate ? (
          <>
            <Text style={styles.placeName}>{candidate.name}</Text>
            <Text style={styles.placeSub} numberOfLines={2}>
              {candidate.formattedAddress}
            </Text>
          </>
        ) : (
          <Text style={styles.placeSub}>{t("notFound")}</Text>
        )}
      </View>
      {candidate && trips.length === 0 && (
        <Text style={styles.empty}>{t("noTrips")}</Text>
      )}
      {candidate &&
        trips.map((tr) => (
          <Pressable
            key={tr.id}
            onPress={() => pick(tr.id)}
            style={styles.row}
          >
            <Text style={styles.rowLabel}>
              {tripLabels.get(tr.id) ?? tr.title}
            </Text>
          </Pressable>
        ))}
    </SheetScroll>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { paddingBottom: 24 },
    // 何を入れようとしているかを先に見せる（どの旅行に入れるか決める材料）。
    place: {
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 12,
      gap: 2,
      borderRadius: 8,
      backgroundColor: t.secondary,
    },
    placeName: { fontSize: 14, fontWeight: "600", color: t.foreground },
    placeSub: { fontSize: 12, color: t.mutedForeground },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.08),
    },
    rowLabel: { flex: 1, fontSize: 14, color: t.foreground },
    empty: { padding: 16, fontSize: 14, color: t.mutedForeground },
  });
