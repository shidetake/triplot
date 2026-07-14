import { Link, Stack } from "expo-router";
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
export default function TripLayout() {
  const tripId = useTripId();
  const { data } = useTripDetail(tripId);
  const tripTitle = data?.trip?.title ?? "";

  return (
    <>
      <Stack.Screen
        options={{
          title: tripTitle,
          headerBackButtonDisplayMode: "minimal",
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 4 }}>
              <HeaderIconButton
                accessibilityLabel="共有"
                onPress={() => void shareTripInvite(tripId)}
              >
                <ShareIcon size={20} color="#666666" />
              </HeaderIconButton>
              <Link href={`/trips/${tripId}/edit`} asChild>
                <HeaderIconButton accessibilityLabel="旅行を編集">
                  <SettingsIcon size={20} color="#666666" />
                </HeaderIconButton>
              </Link>
            </View>
          ),
        }}
      />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* 管理系モーダルは formSheet ＝ iOS 純正の持ち手（grabber）付きシート。
            アプリ内の @gorhom ボトムシート（フォーム・一覧）と「持ち手のある
            シート」で見た目を揃える。高さは内容量で決める
            （sheetAllowedDetents="fitToContents"）＝ 3行だけのエクスポート
            画面は低く、フォームが長い編集画面は自然と高くなる。中身が画面を
            超える場合は iOS 側が全開にクランプし、ScrollView 内でスクロール
            可能（ui-guidelines「画面高からの引き算」原則の RN 版＝ここでは
            引き算をコンテンツ実測に任せる形）。formSheet はナビヘッダーを
            出さないのでタイトルは各画面が SheetTitle で描く。 */}
        {(["edit", "categories", "export", "calendar-export"] as const).map(
          (name) => (
            <Stack.Screen
              key={name}
              name={name}
              options={{
                presentation: "formSheet",
                sheetAllowedDetents: "fitToContents",
                sheetGrabberVisible: true,
                headerShown: false,
              }}
            />
          ),
        )}
      </Stack>
    </>
  );
}
