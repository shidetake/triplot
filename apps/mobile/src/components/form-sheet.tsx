import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
  type BottomSheetModalProps,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Keyboard,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  type RefreshControlProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/lib/theme";

// iOS 標準のコンパクトナビバー高（pt）。ヘッダー帯の実高 = safe area 上端 + これ。
const NAV_BAR_HEIGHT = 44;

// フォームを下からせり上がるボトムシートで出すホスト（web モバイルの vaul UX を
// RN で再現。@gorhom/bottom-sheet を使う）。呼び出し側は ref.present()/dismiss()
// で開閉する。内容は render prop で受け、閉じるための dismiss を渡す。
// 展開時の高さは「画面高 − ヘッダー帯」＝ナビバー（旅行名）がちょうど全部
// 見える位置まで（ui-guidelines「画面高からの引き算で決める」。割合の
// 決め打ちはしない）。
export type FormSheetRef = {
  present: () => void;
  dismiss: () => void;
};

export const FormSheet = forwardRef<
  FormSheetRef,
  {
    // 中身の高さちょうどまで開く（地図のピン→場所フォームなど、地図の文脈を
    // 残したい用途）。既定 false = 従来どおりヘッダー帯下端まで全開。
    sizeToContent?: boolean;
    // 固定の展開位置（例 ["85%"]）。予定/費用フォームのように「種別の切替で
    // 中身の量が変わる」フォーム用＝最初から毎回いきなり全開になるのを避け、
    // 一番中身が多いパターン（時差移動＋参加者複数選択、外貨＋割り勘カスタム
    // 等）が収まる高さを事前に見積もって固定する。sizeToContent より優先。
    snapPoints?: string[];
    // 完全に閉じた後（スワイプ閉じ・プログラム dismiss の両方）。地図タブが
    // 候補ピンの選択ハイライトを解除するのに使う。
    onDismiss?: () => void;
    // pull-to-refresh のあるシート（受信箱等）用。RN の <RefreshControl /> を
    // そのまま渡す（BottomSheetScrollView は RN の ScrollView 互換 API）。
    refreshControl?: ReactElement<RefreshControlProps>;
    // scrim（背景の暗さ）の濃さ。既定 0.75。地図タブの場所フォームだけ 0 を
    // 渡す＝背後の地図を暗くせず、地図とフォームを同時に見せるのがこのシートの
    // 存在意義のため（本家 Google/Apple マップの場所カードも背景を暗くしない）。
    backdropOpacity?: number;
    // 別の FormSheet が開いている状態でこれを present() した時の重なり方。
    // @gorhom 既定は "switch"（前のシートを minimize→このシートが閉じたら
    // restore）。ドリルイン（旅行編集→カテゴリ管理 等）は "push"（前のシートを
    // 閉じずそのまま裏に残し、このシートを上に重ねる。閉じれば裏のシートが
    // そのまま見える＝Discord 等のモーダルスタックと同じ）を渡す。
    stackBehavior?: BottomSheetModalProps["stackBehavior"];
    // キーボード表示時のシートの動き。既定 "interactive" = シート全体を
    // キーボードの高さぶん持ち上げる（背景の文脈が要らない管理系シート向け。
    // 全項目が見えるのが正義）。"extend" = KeyboardMinimalLift による部分
    // リフト＝フォーカス入力がキーボードに被る分「だけ」シートを持ち上げ、
    // 中身には触らない（地図の場所フォームなど、背景を見せ続けたいシート
    // 向け。全体持ち上げだと背景が丸ごと隠れて本末転倒になる）。
    keyboardBehavior?: "interactive" | "extend";
    children: (
      dismiss: () => void,
      scrollToEnd: (animated?: boolean) => void,
    ) => ReactNode;
  }
>(function FormSheet(
  {
    sizeToContent = false,
    snapPoints,
    onDismiss,
    refreshControl,
    backdropOpacity = 0.75,
    stackBehavior,
    keyboardBehavior = "interactive",
    children,
  },
  ref,
) {
  const modalRef = useRef<BottomSheetModal>(null);
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const dismiss = useCallback(() => modalRef.current?.dismiss(), []);
  const scrollToEnd = useCallback((animated = true) => {
    scrollRef.current?.scrollToEnd({ animated });
  }, []);

  // extend の部分リフト（原則「シートだけを動かし、中身には触らない」）。
  // キーボード表示時にフォーカス入力を実測し、被る分「だけ」シートを高くする。
  // 実現方法は「snapPoints の値を lift 分増やす」＝gorhom 公式の snapPoints
  // 変更（SNAP_POINT_CHANGE）で index 0 のまま新しい高さへアニメさせる。
  // snapToPosition（一時位置）は BottomSheetModal で dismiss（index=-1）を
  // 誘発するので使わない（実測で特定）。そのため extend シートは
  // enableDynamicSizing を使わず、中身の高さも自前で実測して snapPoints を組む。
  const isExtend = keyboardBehavior === "extend";
  const topFloor = insets.top + NAV_BAR_HEIGHT;
  const { height: windowHeight } = useWindowDimensions();
  const animatedPosition = useSharedValue(0);
  const [contentH, setContentH] = useState(0);
  const [liftExtra, setLiftExtra] = useState(0);
  const kbHandledRef = useRef(false);
  // 部分リフトで持ち上げきれない分（シートが上限に達した残り）は、中身を
  // translateY で持ち上げて補う。ScrollView のスクロールは使わない — gorhom は
  // シート状態と結びつけて contentOffset を管理しており、外からの scrollTo が
  // 効かない（実測）。transform なら gorhom ともスクロール位置とも無関係で、
  // はみ出た上端は ScrollView の clip に隠れて「スクロールした」ように見える。
  const contentShift = useSharedValue(0);
  const contentShiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -contentShift.value }],
  }));
  // 持ち手まわりの高さ（enableDynamicSizing が detent に足すのと同等の値）。
  const HANDLE_HEIGHT = 24;
  const extendSnapPoints = useMemo(() => {
    const base = Math.max(contentH + HANDLE_HEIGHT, 120);
    return [Math.min(base + liftExtra, windowHeight - topFloor)];
  }, [contentH, liftExtra, windowHeight, topFloor]);
  useEffect(() => {
    if (!isExtend) return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      if (kbHandledRef.current) return; // 1表示につき1回（再発火ラチェット防止）
      kbHandledRef.current = true;
      const focused = TextInput.State.currentlyFocusedInput();
      if (!focused) return;
      focused.measureInWindow((_x, y, _w, h) => {
        const keyboardTop = e.endCoordinates.screenY;
        const overlap = y + h + 24 - keyboardTop;
        if (overlap <= 0) return;
        const sheetTop = animatedPosition.value; // 画面上端からの実測位置
        const lift = Math.min(overlap, Math.max(0, sheetTop - topFloor));
        if (lift > 0) setLiftExtra(lift);
        // 持ち上げきれない分（シートが上限に達する背の高いフォームのみ）は
        // 中身の translateY で補う（contentShift の宣言コメント参照）。
        const leftover = overlap - lift;
        if (leftover > 4) {
          contentShift.value = withTiming(leftover, { duration: 250 });
        }
      });
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      kbHandledRef.current = false;
      setLiftExtra(0); // 元の高さへ戻す
      contentShift.value = withTiming(0, { duration: 250 });
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [isExtend, topFloor, animatedPosition, contentShift]);

  // scrim（背景を半透明の黒で覆う）。モーダル的なシート（背後を操作させない）
  // には可視の scrim を使うのが業界標準（Material Design は「見えない scrim
  // はユーザーを欺くので非推奨」と明言）。FormSheet は常に単一の snapPoint
  // （index 0）で開閉するため、appearsOnIndex/disappearsOnIndex の既定値
  // （複数スナップポイント前提の 1/0）のままだと backdrop が常に透明になる
  // ＝明示的に 0/-1 を指定する。opacity は既定 0.5 だと弱く見える＝
  // ダークモードの地色（#0a0a0a）がほぼ黒なので、黒い半透明幕を重ねても
  // 明るさの変化が乏しいため（実機フィードバック）。X/TripIt 程度の
  // 沈み込みに近づけて 0.75 に上げる（backdropOpacity で個別に上書き可）。
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={backdropOpacity}
      />
    ),
    [backdropOpacity],
  );

  useImperativeHandle(ref, () => ({
    present: () => modalRef.current?.present(),
    dismiss,
  }));

  return (
    <BottomSheetModal
      ref={modalRef}
      // sizeToContent: snap 点は中身の実測高（enableDynamicSizing が
      // BottomSheetScrollView を測って追加する）。上限は topInset で
      // 従来の全開位置と同じ＝中身が長い時は従来と同じ高さでスクロール。
      // snapPoints 指定時はそれを固定の展開位置として使う。
      snapPoints={
        isExtend
          ? extendSnapPoints
          : (snapPoints ?? (sizeToContent ? undefined : ["100%"]))
      }
      stackBehavior={stackBehavior}
      animatedPosition={animatedPosition}
      onDismiss={onDismiss}
      // 100% はこの topInset を引いた残り＝シート上端がヘッダー帯の下端に揃う。
      topInset={insets.top + NAV_BAR_HEIGHT}
      enableDynamicSizing={!isExtend && !snapPoints && sizeToContent}
      // キーボード対応（prop の説明参照）。入力部品の使い分けが重要:
      // - interactive のシート: 入力は BottomSheetTextInput（フォーカスが
      //   シートに伝わって初めて gorhom の持ち上げが動く）
      // - extend のシート: 入力は素の TextInput にする。BottomSheetTextInput
      //   だと gorhom が表示域をキーボード上端まで縮め、その ScrollView の
      //   リサイズに反応した UIKit が「キャレットを見せよう」と中身を勝手に
      //   スクロール＝中身だけ飛んで真っ白/真っ黒になる（実測で特定）。
      //   素の TextInput なら gorhom はキーボードに完全無反応で、動くのは
      //   KeyboardMinimalLift（シートの平行移動）だけ＝中身は誰にも
      //   触られない
      keyboardBehavior={keyboardBehavior}
      keyboardBlurBehavior="restore"
      // 背景は薄暗く（モーダル・scrim）＋ドラッグで閉じ・背景タップで閉じ
      // （pressBehavior 既定 "close"）。上に元画面が薄暗く透けて残る。
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: t.background }}
      handleIndicatorStyle={{ backgroundColor: t.fgAlpha(0.2) }}
    >
      <BottomSheetScrollView
        ref={scrollRef}
        // キーボード表示時に下インセットを足し、フォーカス中の入力（とその直下の
        // サジェスト）がキーボードに隠れないようスクロール可能にする（iOS 標準挙動。
        // シートが持ち上がりきれない大きいシートでの保険）。
        // extend のシートでは切る — gorhom の表示域シュリンクと二重に効いて
        // 中身だけ上に飛び「シートが真っ黒」になる実機バグの原因だった。
        automaticallyAdjustKeyboardInsets={keyboardBehavior !== "extend"}
        keyboardShouldPersistTaps="handled"
        // 内容がシートの高さにぴったり収まる（fitToContents/sizeToContent）とき、
        // 引っ張ると中身だけラバーバンドして不自然に見えるのを防ぐ。
        // pull-to-refresh（RefreshControl）は alwaysBounceVertical=false でも
        // 指で引っ張っている間は contentOffset が動くため機能する
        // （受信箱だけ条件分岐で有効にしていたところ、そこだけラバーバンドが
        // 残る＝画面によって手触りが違う、という実機報告を受けて統一）。
        alwaysBounceVertical={false}
        onContentSizeChange={(_w: number, h: number) => {
          if (isExtend) setContentH(h);
        }}
        refreshControl={refreshControl}
        contentContainerStyle={[
          styles.content,
          // フィット時はシート下端＝画面下端なので、ホームインジケータぶんを
          // 足して最下段の要素まで「ちょうど全部見える」ようにする。
          sizeToContent && { paddingBottom: insets.bottom + 24 },
        ]}
      >
        {isExtend ? (
          <Animated.View style={contentShiftStyle}>
            {children(dismiss, scrollToEnd)}
          </Animated.View>
        ) : (
          children(dismiss, scrollToEnd)
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
});
