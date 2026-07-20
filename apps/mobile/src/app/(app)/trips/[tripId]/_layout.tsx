import { router, Stack } from "expo-router";
import { useCallback, useMemo } from "react";
import { View } from "react-native";

import { HeaderIconButton } from "@/components/header-icon-button";
import { SettingsIcon, ShareIcon } from "@/components/icons";
import { shareTripInvite } from "@/lib/shareTripInvite";
import { useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// 旅行詳細のルート。ヘッダーは親 Stack の1本だけ（戻る + 旅行名 + 共有 + 編集）。
// 共有はこのアプリの肝なのでメニューに埋めず1タップのボタン（web が共有
// アイコン単体を出しているのと同じ）。
// 最初の <Stack.Screen> は自分を内包する親 Stack（(app)/_layout.tsx）の
// この route のオプションを注入する（旅行名が動的なので layout 側に書けない）。
// ネストした Stack 自身はヘッダーを出さない（二重ヘッダー防止）。
//
// 旅行編集・カテゴリ管理・エクスポート・カレンダーエクスポートの4枚は
// native の formSheet ルート（presentation: "formSheet"）。論理的には
// ドリルイン（編集→カテゴリ/エクスポート、エクスポート→カレンダー）だが、
// 実装上は互いに兄弟ルートとして並べ、router.push で潜る（native-stack の
// push が @gorhom の stackBehavior="push" と同じ「前を裏に残して上に重ねる」
// 挙動を素で持つ）。場所フォーム（地図の文脈を残す必要がある）だけは
// まだ @gorhom ベースの FormSheet のまま（段階移行の途中。ui-guidelines
// 参照）。
export default function TripLayout() {
  const tripId = useTripId();
  const { data } = useTripDetail(tripId);
  const tripTitle = data?.trip?.title ?? "";

  // options は identity が変わるたびに expo-router が navigation.setOptions を
  // 呼ぶ。useTripDetail はいいね・優先度変更等の invalidate のたびに再レンダー
  // するので、素のオブジェクトリテラルだと操作のたび native ヘッダーが更新され、
  // まれに戻るボタンが消える（react-native-screens のヘッダー高頻度更新系の
  // 既知不具合。再起動まで直らない実機報告あり）。タイトルが実際に変わった時
  // だけ setOptions が走るようメモ化する。
  const headerRight = useCallback(
    () => (
      <View style={{ flexDirection: "row", gap: 4 }}>
        <HeaderIconButton
          accessibilityLabel="共有"
          onPress={() => void shareTripInvite(tripId)}
        >
          <ShareIcon size={20} color="#666666" />
        </HeaderIconButton>
        <HeaderIconButton
          accessibilityLabel="旅行を編集"
          onPress={() => router.push(`/trips/${tripId}/edit`)}
        >
          <SettingsIcon size={20} color="#666666" />
        </HeaderIconButton>
      </View>
    ),
    [tripId],
  );
  const screenOptions = useMemo(
    () => ({
      title: tripTitle,
      headerBackButtonDisplayMode: "minimal" as const,
      headerRight,
    }),
    [tripTitle, headerRight],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="edit" options={sheetScreenOptions} />
        <Stack.Screen name="categories" options={sheetScreenOptions} />
        <Stack.Screen name="export" options={sheetScreenOptions} />
        <Stack.Screen name="calendar-export" options={sheetScreenOptions} />
      </Stack>
    </>
  );
}

const sheetScreenOptions = {
  headerShown: false,
  presentation: "formSheet" as const,
  sheetAllowedDetents: "fitToContents" as const,
  sheetGrabberVisible: true,
  sheetCornerRadius: 20,
};
