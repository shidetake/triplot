import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { fetchUnassignedInboundCount } from "@triplot/shared/data/reads/inbox";
import { fetchUserProfile } from "@triplot/shared/data/reads/trips";

import { HeaderIconButton } from "@/components/header-icon-button";
import { InboxIcon } from "@/components/icons";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// ナビバー右の「受信箱＋アバター」。旅行一覧と旅行詳細の両方に出す
// （web の AppHeader 右側と同じ。どの画面からでも取り込みとアカウントに
// 届き、シートなので閉じれば元の画面に戻る）。
//
// tripId を渡すとアカウントのシートに「この旅行」の行が出る（旅行詳細から
// 開いた時だけ。web がアカウントメニューに「この旅行 ▸」を差し込むのと同じ）。
export function HeaderAccountButtons({ tripId }: { tripId?: string }) {
  const tHeader = useTranslations("header");
  const tSettings = useTranslations("settings");
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: inboxCount } = useQuery({
    queryKey: ["inboxCount", userId],
    queryFn: () => fetchUnassignedInboundCount(supabase, userId!),
    enabled: !!userId,
  });
  // queryKey は設定シートと同じなのでキャッシュ共有され、アバター変更が
  // 即ここにも反映する。
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
    <View style={styles.row}>
      <HeaderIconButton
        accessibilityLabel={tHeader("import")}
        onPress={() => router.push("/trips/import")}
      >
        <View>
          <InboxIcon size={20} color={theme.mutedForeground} />
          {(inboxCount ?? 0) > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {(inboxCount ?? 0) > 9 ? "9+" : inboxCount}
              </Text>
            </View>
          )}
        </View>
      </HeaderIconButton>
      {/* アバター＝アカウント（設定）の入口。自分のアバターは中立 zinc
          （メンバー色 hue とは別系統）。 */}
      <HeaderIconButton
        accessibilityLabel={tSettings("heading")}
        onPress={() =>
          router.push(
            tripId ? `/trips/settings?tripId=${tripId}` : "/trips/settings",
          )
        }
      >
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>{avatarInitial}</Text>
          </View>
        )}
      </HeaderIconButton>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    // ヘッダーのアバター（24px 丸。ナビアイコンの 24 と同段）。
    avatar: { width: 24, height: 24, borderRadius: 12 },
    avatarFallback: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: t.fgAlpha(0.1),
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitial: { fontSize: 12, fontWeight: "500", color: t.mutedForeground },
    badge: {
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
    badgeText: { fontSize: 9, fontWeight: "600", color: t.primaryForeground },
  });
