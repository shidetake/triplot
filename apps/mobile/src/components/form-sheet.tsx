import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { StyleSheet, type RefreshControlProps } from "react-native";
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
    children: (dismiss: () => void) => ReactNode;
  }
>(function FormSheet(
  { sizeToContent = false, snapPoints, onDismiss, refreshControl, children },
  ref,
) {
  const modalRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const dismiss = useCallback(() => modalRef.current?.dismiss(), []);

  // scrim（背景を半透明の黒で覆う）。モーダル的なシート（背後を操作させない）
  // には可視の scrim を使うのが業界標準（Material Design は「見えない scrim
  // はユーザーを欺くので非推奨」と明言）。FormSheet は常に単一の snapPoint
  // （index 0）で開閉するため、appearsOnIndex/disappearsOnIndex の既定値
  // （複数スナップポイント前提の 1/0）のままだと backdrop が常に透明になる
  // ＝明示的に 0/-1 を指定する。opacity は既定 0.5 だと弱く見える＝
  // ダークモードの地色（#0a0a0a）がほぼ黒なので、黒い半透明幕を重ねても
  // 明るさの変化が乏しいため（実機フィードバック）。X/TripIt 程度の
  // 沈み込みに近づけて 0.75 に上げる。
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.75}
      />
    ),
    [],
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
      snapPoints={snapPoints ?? (sizeToContent ? undefined : ["100%"])}
      onDismiss={onDismiss}
      // 100% はこの topInset を引いた残り＝シート上端がヘッダー帯の下端に揃う。
      topInset={insets.top + NAV_BAR_HEIGHT}
      enableDynamicSizing={!snapPoints && sizeToContent}
      // sizeToContent（中身の実測高さで開く）のシートは、開いた時点のサイズに
      // 固定されたまま。後からキーボードが出ると、シートの高さはそのままで
      // 中身だけキーボードに押し潰され隠れる（地図長押しの仮ピン→名前入力等で
      // 顕著）。keyboardBehavior="extend" でキーボード表示時にシート自体を
      // キーボード上端まで拡張し、"restore" でキーボードを閉じたら元の高さに
      // 戻す。
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      // 背景は薄暗く（モーダル・scrim）＋ドラッグで閉じ・背景タップで閉じ
      // （pressBehavior 既定 "close"）。上に元画面が薄暗く透けて残る。
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: t.background }}
      handleIndicatorStyle={{ backgroundColor: t.fgAlpha(0.2) }}
    >
      <BottomSheetScrollView
        // キーボード表示時に下インセットを足し、フォーカス中の入力（とその直下の
        // サジェスト）がキーボードに隠れないようスクロール可能にする（iOS 標準挙動）。
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        // 内容がシートの高さにぴったり収まる（fitToContents/sizeToContent）とき、
        // 引っ張ると中身だけラバーバンドして不自然に見えるのを防ぐ。
        // pull-to-refresh（RefreshControl）は alwaysBounceVertical=false でも
        // 指で引っ張っている間は contentOffset が動くため機能する
        // （受信箱だけ条件分岐で有効にしていたところ、そこだけラバーバンドが
        // 残る＝画面によって手触りが違う、という実機報告を受けて統一）。
        alwaysBounceVertical={false}
        refreshControl={refreshControl}
        contentContainerStyle={[
          styles.content,
          // フィット時はシート下端＝画面下端なので、ホームインジケータぶんを
          // 足して最下段の要素まで「ちょうど全部見える」ようにする。
          sizeToContent && { paddingBottom: insets.bottom + 24 },
        ]}
      >
        {children(dismiss)}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
});
