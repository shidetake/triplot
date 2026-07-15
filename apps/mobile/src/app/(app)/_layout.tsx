import { Redirect, Stack } from "expo-router";

import { useSession } from "@/lib/session";

// 認証ゲート: この (app) グループ配下は要ログイン。
// セッション復元中（isLoading）は何も描かない（スプラッシュが続いて見えるだけ）。
//
// 各画面のタイトル・presentation はここで静的に宣言する。画面内から
// `<Stack.Screen options={{ presentation: "modal" }}>` を動的に設定すると
// React Navigation がそのオプション更新ごと無視する（タイトルも効かず
// ルートパスがナビバーに出る）ため、画面内で設定してよいのは動的な値
// （旅行名タイトル・headerRight 等）だけ。
export default function AppLayout() {
  const { session, isLoading } = useSession();

  if (isLoading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Stack>
      {/* アプリのホーム。ブランドはここだけ（iOS はアプリ名を常時出さないのが
          流儀だが、ルート画面のラージタイトルとしてワードマークを置く）。 */}
      <Stack.Screen
        name="trips/index"
        options={{ title: "triplot", headerLargeTitle: true }}
      />
      {/* 管理系モーダルは formSheet ＝ iOS 純正の持ち手（grabber）付きシート。
          高さは内容量で決める（sheetAllowedDetents="fitToContents"）。
          trips/[tripId] 配下（編集/カテゴリ/エクスポート等）と同じ規約
          （そちらは統一済みで、この3画面だけ旧 pageSheet のまま漏れていた）。
          formSheet はナビヘッダーを出さないのでタイトルは各画面が
          SheetTitle で描く。 */}
      {(["trips/new", "inbox", "settings"] as const).map((name) => (
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
      ))}
      {/* 旅行詳細はネストした Stack が自分でヘッダーを構成する（旅行名+編集）。
          タイトル等は trips/[tripId]/_layout.tsx が Stack.Screen で注入する。 */}
    </Stack>
  );
}
