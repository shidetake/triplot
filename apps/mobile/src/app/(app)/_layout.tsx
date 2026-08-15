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
      {/* trips/[tripId] は旅行名が動的なのでここでは静的な title だけ宣言
          （中身は [tripId]/_layout.tsx が旅行データ到着後に動的注入する）。
          ここで title: "" を明示しておかないと、旅行データが届くまでの
          最初の1フレームは native-stack がこのルートのデフォルトタイトル
          （ファイルパスそのもの "trips/[tripId]"）を出してしまう
          （動的注入は子コンポーネントの effect 経由なので1テンポ遅れる）。 */}
      <Stack.Screen name="trips/[tripId]" options={{ title: "" }} />
      {/* 取り込み・設定・フィードバック・旅行作成は native の formSheet
          ルート（react-native-screens の presentation: "formSheet"）。
          以前は @gorhom ベースの FormSheet に統一していたが、OS 標準の
          質感（キーボード対応込み）に寄せる方針転換によりこちらへ移行した
          （docs/architecture.md 相当の設計判断はプランに記載）。
          旅行詳細（旅行編集・カテゴリ管理・エクスポート・場所フォーム等）も
          既にこちらへ移行済み（[tripId]/_layout.tsx 参照）。@gorhom ベースの
          FormSheet コンポーネント（components/form-sheet.tsx）が残るのは
          TODO タブの優先度ピッカー1箇所だけ（ActionSheetIOS がアイコン付き
          行を出せないための例外。タブ画面に native の ScreenStack を
          入れ子にする移行はタブバー/戻るジェスチャーへの影響を実機で
          検証してからにしたい、という理由でまだ残している）。
          sheetCornerRadius は指定しない（native 既定 = automatic）。固定値
          （旧20pt）だと iOS26 の大きな continuous コーナー＋左右の浮きマージンと
          半径が噛み合わず本家と違う丸みに見えるため、OS のオート計算に任せる
          （場所タブの地図シートと同じ理由。place.tsx 参照）。 */}
      <Stack.Screen
        name="trips/inbox"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="trips/settings"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      {/* フィードバック・このアプリについて・OSSライセンスは設定からの
          ドリルイン（router.push）。native-stack の push は @gorhom の
          stackBehavior="push" と同じ「前を裏に残して上に重ねる」挙動を
          素で持つ。ライセンス一覧はこのアプリについてからのさらに1段
          ドリルイン。 */}
      <Stack.Screen
        name="trips/feedback"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="trips/about"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      {/* ライセンス一覧（576件）は中身にフィットさせず、開いた瞬間から
          ほぼ画面いっぱいの決め打ち detent にする（fitToContents だと
          中身が長大でシート自体の初期計測が安定しない）。 */}
      <Stack.Screen
        name="trips/licenses"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.9],
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="trips/new"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
    </Stack>
  );
}
