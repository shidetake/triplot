import { Stack } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  type TextLayoutEventData,
  useWindowDimensions,
  View,
} from "react-native";
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
  // 右のボタン群の実寸。タイトルの幅を決めるのに要る（下の titleMaxWidth）。
  // 数えて定数にすると、ボタンの padding やアイコンの大きさを触ったときに
  // 黙ってずれるので測る。中身は固定（バッジは絶対配置で幅を変えない・
  // アバターは画像でも頭文字でも 24pt）なので、初回のレイアウトで落ち着いて
  // それ以降は更新されない＝ヘッダーの高頻度更新にはならない。
  const [rightWidth, setRightWidth] = useState(0);
  const onRightLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setRightWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w));
  }, []);
  const headerRight = useCallback(
    () => (
      <View
        onLayout={onRightLayout}
        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        <HeaderIconButton
          accessibilityLabel={tActions("share")}
          onPress={() => void shareTripInvite(tripId)}
        >
          <ShareIcon size={20} color="#666666" />
        </HeaderIconButton>
        <HeaderAccountButtons tripId={tripId} />
      </View>
    ),
    [tripId, tActions, onRightLayout],
  );

  // **タイトルの幅は自分で決める。** 中央のタイトルは headerRight の幅を
  // 避けてくれないので、上限を持たせないと長い旅行名がボタン群の下へ潜り込む
  // ——省略記号すら出ず、ただ隠れる（実機フィードバック: "Peru & the West
  // Coast"）。左右の取り分を引いた残りが、実際にタイトルが使える幅。
  const { width: windowWidth } = useWindowDimensions();
  const titleMaxWidth = Math.max(
    MIN_TITLE_WIDTH,
    windowWidth -
      TITLE_LEFT_INSET -
      (rightWidth || FALLBACK_RIGHT_WIDTH) -
      HEADER_RIGHT_INSET -
      TITLE_GAP,
  );
  // 旅行名を素の大きさで描いたときの幅。縮める量を決めるのに要る。
  //
  // **RN の adjustsFontSizeToFit は使わない。** 縮めてはくれるが
  // minimumFontScale を効かせてくれず、下限を 14pt に指定しても止まらない
  // （シミュレータで実測: 50文字の旅行名が約 8pt ＝ 下の日程より小さくなった）。
  // 下限の無い縮小は、長い名前ほど静かに読めなくなるので採らない。
  // 画面に出さない同じ書式の Text で素の幅を測り、入る大きさを自分で決める。
  const [naturalTitleWidth, setNaturalTitleWidth] = useState(0);
  const onTitleTextLayout = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      const w = e.nativeEvent.lines[0]?.width ?? 0;
      setNaturalTitleWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w));
    },
    [],
  );
  // 入るなら素の大きさ、入らないなら入る大きさ、ただし下限まで。下限でも
  // 入らなければ末尾を省略する（numberOfLines={1} が効く）。
  const titleFontSize =
    naturalTitleWidth > titleMaxWidth
      ? Math.max(
          TITLE_MIN_FONT_SIZE,
          Math.floor((TITLE_FONT_SIZE * titleMaxWidth) / naturalTitleWidth),
        )
      : TITLE_FONT_SIZE;

  // 2行タイトル（旅行名＋日程）。headerTitle も headerRight と同じく identity が
  // 変わるたび setOptions が走るのでメモ化する。
  const headerTitle = useCallback(
    () => (
      <View style={[styles.titleBlock, { maxWidth: titleMaxWidth }]}>
        {/* 幅を測るためだけの控え。絶対配置で流れから外し、十分広い幅を
            与えて素の1行の幅を測る。読み上げからも外す（同じ文言が2回
            読まれないように）。 */}
        <Text
          style={styles.titleMeasure}
          numberOfLines={1}
          onTextLayout={onTitleTextLayout}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {tripTitle}
        </Text>
        <Text
          style={[styles.title, { fontSize: titleFontSize }]}
          numberOfLines={1}
        >
          {tripTitle}
        </Text>
        {dateRange ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {dateRange}
          </Text>
        ) : null}
      </View>
    ),
    [
      tripTitle,
      dateRange,
      styles,
      titleMaxWidth,
      titleFontSize,
      onTitleTextLayout,
    ],
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

// タイトルの器の左端。中身が native なので測れず、シミュレータの
// スクリーンショットを実測した値（iPhone 16 Pro / iOS 26 で 71.8pt）。
// 戻るボタンのガラスのカプセルと、その左右のマージンのぶん。
// **器は中央ではなくここに左端を固定して右へ伸びる**（幅を 120pt に絞っても
// 182pt にしても左端は動かなかった）ので、左の取り分はこの1つで決まる。
const TITLE_LEFT_INSET = 72;
// 右のボタン群が、測れる RN ビューの外側で取る幅（実測 24pt）。iOS 26 が
// 被せるガラスのカプセルの左右の余白 8×2 と、画面端までのマージン 8。
const HEADER_RIGHT_INSET = 24;
// タイトルとボタンの間に残す隙間。
const TITLE_GAP = 8;
// 右のボタン群を測る前（初回レンダーの一瞬）に使う見積り。共有 40 ＋ 4 ＋
// 受信箱 40 ＋ 8 ＋ アバター 44。測れたらそちらで上書きする。
const FALLBACK_RIGHT_WIDTH = 136;
// 左右を引くと残らないほど狭い端末でも、これだけは確保する。
const MIN_TITLE_WIDTH = 120;
// タイトルの素の大きさ（iOS 標準のナビバーのタイトルと同じ 17pt）。
const TITLE_FONT_SIZE = 17;
// 縮めてよい下限。14 は本文の大きさ（ui-guidelines「テキストサイズの階層」）
// で、ナビバーでもまだ読める。これより小さくするくらいなら末尾を省略する。
const TITLE_MIN_FONT_SIZE = 14;

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
    // 2行タイトル。**戻るボタンと右のボタン群の隙間の中央**に置く。
    //
    // 入れ物を flex: 1 で隙間いっぱいに広げてから中央寄せする。中身の幅に
    // 合わせた入れ物にすると、中央寄せが効く範囲が文字の幅だけになり、
    // 隙間の左端に詰めて置かれる（実機で確認）。幅を px で決め打ちすると
    // 旅行名の長さでずれるので、必ずレイアウトで解く。
    // 上限（maxWidth）だけは呼び出し側が実寸から計算して渡す。
    //
    // **中央寄せは alignItems ではなく textAlign でやる。** alignItems:
    // "center" にすると子は「中身の幅」で置かれる＝入れ物の maxWidth を
    // 受け取らないので、長い旅行名が入れ物の外へそのままはみ出す（実機で
    // 確認: 入れ物を 120pt に絞っても文字は素の幅のまま描かれた）。
    // stretch にして入れ物の幅を受け取らせて初めて、縮めるのも末尾を
    // 省略するのも効くようになる。
    titleBlock: { flex: 1, alignItems: "stretch", justifyContent: "center" },
    title: {
      fontSize: TITLE_FONT_SIZE,
      fontWeight: "600",
      color: t.foreground,
      textAlign: "center",
    },
    // 幅を測るためだけの控え。絶対配置＋十分な幅で、器の maxWidth に縛られずに
    // 素の1行の幅を測る（縛られると測った幅が器の幅になり、縮小量が出せない）。
    titleMeasure: {
      position: "absolute",
      opacity: 0,
      width: 10000,
      fontSize: TITLE_FONT_SIZE,
      fontWeight: "600",
    },
    subtitle: {
      fontSize: 11,
      color: t.mutedForeground,
      marginTop: 1,
      textAlign: "center",
    },
  });
