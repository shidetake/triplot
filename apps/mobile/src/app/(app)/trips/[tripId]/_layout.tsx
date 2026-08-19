import { Stack } from "expo-router";
import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocale, useTranslations } from "use-intl";

import { formatTripDateRange } from "@triplot/shared/ymd";

import { HeaderAccountButtons } from "@/components/header-account-buttons";
import { HeaderIconButton } from "@/components/header-icon-button";
import { ShareIcon } from "@/components/icons";
import { shareTripInvite } from "@/lib/shareTripInvite";
import { type Theme, useThemedStyles } from "@/lib/theme";
import { useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// 旅行詳細のルート。ヘッダーは親 Stack の1本だけ（戻る + 旅行名 + 共有 +
// 受信箱 + アバター）。
// 共有はこのアプリの肝なのでメニューに埋めず1タップのボタン（web が共有
// アイコン単体を出しているのと同じ）。
// 受信箱とアバターは旅行一覧と同じものを出す（HeaderAccountButtons）。
// 旅行の設定（旧・歯車）はアバターのシートの中の「この旅行」に吸収した:
// 旅行詳細でもアカウントの入口が要る＝2つのメニューが隣り合うので、
// 片方に寄せた（web と同じ判断。ui-guidelines「ナビ / メニューの使い分け」）。
// 最初の <Stack.Screen> は自分を内包する親 Stack（(app)/_layout.tsx）の
// この route のオプションを注入する（旅行名が動的なので layout 側に書けない）。
// ネストした Stack 自身はヘッダーを出さない（二重ヘッダー防止）。
//
// 旅行編集・カテゴリ管理・エクスポート・カレンダーエクスポート・予定/費用
// フォームは native の formSheet ルート（presentation: "formSheet"）。論理的
// にはドリルイン（編集→カテゴリ/エクスポート、エクスポート→カレンダー）だが、
// 実装上は互いに兄弟ルートとして並べ、router.push で潜る（native-stack の
// push が「前を裏に残して上に重ねる」挙動を素で持つ）。タブ画面内から出す
// シート（場所フォーム・TODO の優先度ピッカー）は同じ (tabs)/places.tsx /
// (tabs)/todos.tsx 内で react-native-screens の ScreenStack/ScreenStackItem を
// 直接使う別パターン（ルート遷移せずその場で出す。地図やスクロール位置等の
// 画面状態を保つため）。
export default function TripLayout() {
  const tripId = useTripId();
  const { data } = useTripDetail(tripId);
  const tActions = useTranslations("tripActions");
  const locale = useLocale();
  const styles = useThemedStyles(makeStyles);
  const tripTitle = data?.trip?.title ?? "";
  // ヘッダー2行目に日程と精算通貨（web の旅行ヘッダーと同じ情報）。iOS の
  // ナビバーはメンバーのアバター列まで載せられないので、この2つだけを小さく
  // 添える（メンバーは旅行編集シートに一覧がある）。地図タブを詰めないよう、
  // 画面内にバーを足すのではなくナビバーの中で完結させる。
  //
  // **精算通貨は出さない**（web は出す）。iPhone のナビバーは 393pt しかなく、
  // 中央のタイトルは headerRight の幅を避けてくれないので、右が3つ（共有・
  // 受信箱・アバター）になると日程＋精算通貨は入らない。入り切らないと iOS 26 は
  // 右の項目を「…」に畳んでしまい、受信箱のバッジもアバターも見えなくなる
  // （実機で確認）。幅で決まることなので幅に合わせて落とす
  // （ui-guidelines「使える幅で決まること→ビューポート幅で判定」）。
  // 精算通貨は費用タブと旅行の設定シートで分かる。
  const trip = data?.trip;
  const dateRange = trip
    ? formatTripDateRange(trip.start_date, trip.end_date, locale)
    : "";

  // options は identity が変わるたびに expo-router が navigation.setOptions を
  // 呼ぶ。useTripDetail はいいね・優先度変更等の invalidate のたびに再レンダー
  // するので、素のオブジェクトリテラルだと操作のたび native ヘッダーが更新され、
  // まれに戻るボタンが消える（react-native-screens のヘッダー高頻度更新系の
  // 既知不具合。再起動まで直らない実機報告あり）。タイトルが実際に変わった時
  // だけ setOptions が走るようメモ化する。
  const headerRight = useCallback(
    () => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <HeaderIconButton
          accessibilityLabel={tActions("share")}
          onPress={() => void shareTripInvite(tripId)}
        >
          <ShareIcon size={20} color="#666666" />
        </HeaderIconButton>
        <HeaderAccountButtons tripId={tripId} />
      </View>
    ),
    [tripId, tActions],
  );
  // 2行タイトル（旅行名＋日程）。headerTitle も headerRight と同じく identity が
  // 変わるたび setOptions が走るのでメモ化する。
  const headerTitle = useCallback(
    () => (
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {tripTitle}
        </Text>
        {dateRange ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {dateRange}
          </Text>
        ) : null}
      </View>
    ),
    [tripTitle, dateRange, styles],
  );

  const screenOptions = useMemo(
    () => ({
      title: tripTitle,
      headerTitle,
      headerBackButtonDisplayMode: "minimal" as const,
      headerRight,
    }),
    [tripTitle, headerTitle, headerRight],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <Stack>
        <Stack.Screen name="(tabs)" options={tabsScreenOptions} />
        {/* 予定/費用フォームも他の formSheet と同じ fitToContents。日時チップを
            開くと直下に inline カレンダーが伸びるので、シート自身が持ち上がって
            それを見せる（旅行作成シートと同じ挙動＝ui-guidelines）。以前は
            種別切替（通常/終日/時差移動）でシートが伸縮するジャンクを避けて
            固定高 [0.68] にしていたが、固定高だとカレンダーがシートの外に
            はみ出しても ScrollView.scrollTo で追従できない実機不具合が判明
            （react-native-screens の FormSheet+ScrollView 統合がスクロール
            所有権を native 側に持つらしく、scrollTo/scrollToEnd が効かない）。
            持ち上がる体験を優先し fitToContents に戻す。 */}
        <Stack.Screen name="event-form" options={sheetScreenOptions} />
        <Stack.Screen name="expense-form" options={sheetScreenOptions} />
      </Stack>
    </>
  );
}

// インラインのオブジェクトリテラルで渡すと毎レンダー別 identity になり、
// expo-router が都度 setOptions を呼ぶ（上の screenOptions をメモ化している
// のと同じ理由。ヘッダーの高頻度更新は戻るボタンが消える不具合につながる）。
const tabsScreenOptions = { headerShown: false };

// sheetCornerRadius は指定しない（native 既定 = automatic）。固定値（旧20pt）
// だと iOS26 の大きな continuous コーナー＋左右の浮きマージンと半径が噛み合わず
// 本家と違う丸みに見えるため、OS のオート計算に任せる
// （場所タブの地図シートと同じ理由。places.tsx 参照）。
const sheetScreenOptions = {
  headerShown: false,
  presentation: "formSheet" as const,
  sheetAllowedDetents: "fitToContents" as const,
  sheetGrabberVisible: true,
};

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // ナビバーの中央に収まる2行タイトル。1行目は iOS 標準のタイトルと同じ
    // 大きさ・太さ、2行目は補助情報なので muted の小さい文字。
    // 中央の2行タイトル。iOS はこれをバー全体の中央に置き headerRight を
    // 避けてくれないので、右の3つ（共有・受信箱・アバター）に潜らない幅で切る
    // （393pt の画面で中央寄せ＋右 ~110pt ＝ 最大 ~170pt）。
    titleBlock: { alignItems: "center", maxWidth: 170 },
    title: { fontSize: 17, fontWeight: "600", color: t.foreground },
    subtitle: { fontSize: 11, color: t.mutedForeground, marginTop: 1 },
  });
