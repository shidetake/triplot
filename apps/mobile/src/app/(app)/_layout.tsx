import { Redirect, Stack } from "expo-router";
import { useTranslations } from "use-intl";

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
  const t = useTranslations();

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
      <Stack.Screen
        name="trips/new"
        options={{ title: t("trips.create"), presentation: "modal" }}
      />
      <Stack.Screen
        name="inbox"
        options={{ title: t("import.heading"), presentation: "modal" }}
      />
      <Stack.Screen
        name="settings"
        options={{ title: t("settings.heading"), presentation: "modal" }}
      />
      {/* 旅行詳細はネストした Stack が自分でヘッダーを構成する（旅行名+編集）。
          タイトル等は trips/[tripId]/_layout.tsx が Stack.Screen で注入する。 */}
    </Stack>
  );
}
