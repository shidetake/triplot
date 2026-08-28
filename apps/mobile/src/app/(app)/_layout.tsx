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
          アプリ内のシートは全てこの native formSheet に統一されている
          （OS 標準の質感＝キーボード対応込みに寄せる方針。旅行詳細は
          [tripId]/_layout.tsx、タブ画面内のシートは places.tsx / todos.tsx の
          ScreenStack + ScreenStackItem 参照）。
          sheetCornerRadius は指定しない（native 既定 = automatic）。固定値
          （旧20pt）だと iOS26 の大きな continuous コーナー＋左右の浮きマージンと
          半径が噛み合わず本家と違う丸みに見えるため、OS のオート計算に任せる
          （場所タブの地図シートと同じ理由。place.tsx 参照）。 */}
      <Stack.Screen
        name="trips/import"
        options={{
          headerShown: false,
          presentation: "formSheet",
          // **fitToContents にしない。** 合体の明細を開くなど中身の高さが
          // 変わると、シートが測り直されてスクロールが先頭に戻る（実測: 同じ
          // 手順・同じデータで、この1行を fitToContents に戻すと再現する）。
          // 既に別の行が開いている時だけ戻らないのも、片方が閉じて片方が開き
          // 高さがほぼ変わらないため。受信箱は下書きの一覧で普段から縦に長く、
          // 全高で開いても困らない。
          sheetAllowedDetents: [1],
          sheetGrabberVisible: true,
        }}
      />
      {/* 取り込み下書きの旅行割当は受信箱からの router.push ドリルイン
          （旅行編集→カテゴリ管理と同じ兄弟ルートパターン）。 */}
      <Stack.Screen
        name="trips/import-pick-trip"
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
      {/* 旅行のシート（編集・カテゴリ管理・エクスポート・カレンダー
          エクスポート）。対象の旅行は ?tripId= で渡す。
          **旅行詳細の入れ子スタックではなくここ（ルート階層）に置く。**
          内側に置くと「その内側にいる画面」からしか開けず、アカウントの
          シートのような外側のシートからは開けない（閉じてから開こうとしても
          その指示が捨てられる。実機で4通り試して全滅）。開く画面の状態
          （地図のカメラ位置・スクロール位置）を保つ必要がないシートは
          ルート階層に置くのが既定（docs/ui-guidelines.md
          「シートのルートは原則いちばん外側に置く」）。 */}
      <Stack.Screen
        name="trips/trip-edit"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="trips/trip-categories"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="trips/trip-export"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="trips/trip-calendar-export"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      {/* フィードバック・このアプリについて・OSSライセンスは設定からの
          ドリルイン（router.push）。native-stack の push は「前を裏に残して
          上に重ねる」挙動を素で持つ。ライセンス一覧はこのアプリについてからの
          さらに1段ドリルイン。 */}
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
      {/* Google マップの法的通知も長大なのでライセンス一覧と同じ決め打ち detent。 */}
      <Stack.Screen
        name="trips/google-notice"
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
