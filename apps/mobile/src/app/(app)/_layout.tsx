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
      {/* 取り込み・設定・フィードバック・旅行作成は native の formSheet
          ルート（react-native-screens の presentation: "formSheet"）。
          以前は @gorhom ベースの FormSheet に統一していたが、OS 標準の
          質感（キーボード対応込み）に寄せる方針転換によりこちらへ移行した
          （docs/architecture.md 相当の設計判断はプランに記載）。
          旅行詳細（旅行編集・カテゴリ管理・エクスポート・場所フォーム等）は
          まだ @gorhom のまま＝移行はフェーズを分けて段階的に進めている。 */}
      <Stack.Screen
        name="trips/inbox"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
          sheetCornerRadius: 20,
        }}
      />
      <Stack.Screen
        name="trips/settings"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
          sheetCornerRadius: 20,
        }}
      />
      {/* フィードバックは設定からのドリルイン（router.push）。native-stack の
          push は @gorhom の stackBehavior="push" と同じ「前を裏に残して
          上に重ねる」挙動を素で持つ。 */}
      <Stack.Screen
        name="trips/feedback"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
          sheetCornerRadius: 20,
        }}
      />
      <Stack.Screen
        name="trips/new"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
          sheetCornerRadius: 20,
        }}
      />
    </Stack>
  );
}
