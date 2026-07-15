import {
  BottomSheetModal,
  BottomSheetScrollView,
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
    // 完全に閉じた後（スワイプ閉じ・プログラム dismiss の両方）。地図タブが
    // 候補ピンの選択ハイライトを解除するのに使う。
    onDismiss?: () => void;
    // pull-to-refresh のあるシート（受信箱等）用。RN の <RefreshControl /> を
    // そのまま渡す（BottomSheetScrollView は RN の ScrollView 互換 API）。
    refreshControl?: ReactElement<RefreshControlProps>;
    children: (dismiss: () => void) => ReactNode;
  }
>(function FormSheet(
  { sizeToContent = false, onDismiss, refreshControl, children },
  ref,
) {
  const modalRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const dismiss = useCallback(() => modalRef.current?.dismiss(), []);

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
      snapPoints={sizeToContent ? undefined : ["100%"]}
      onDismiss={onDismiss}
      // 100% はこの topInset を引いた残り＝シート上端がヘッダー帯の下端に揃う。
      topInset={insets.top + NAV_BAR_HEIGHT}
      enableDynamicSizing={sizeToContent}
      // 背景は薄暗く（モーダル）＋ドラッグで閉じ。上に元画面が残る。
      backdropComponent={undefined}
      backgroundStyle={{ backgroundColor: t.background }}
      handleIndicatorStyle={{ backgroundColor: t.fgAlpha(0.2) }}
    >
      <BottomSheetScrollView
        // キーボード表示時に下インセットを足し、フォーカス中の入力（とその直下の
        // サジェスト）がキーボードに隠れないようスクロール可能にする（iOS 標準挙動）。
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        // 内容がシートの高さにぴったり収まる（fitToContents/sizeToContent）とき、
        // 引っ張ると中身だけラバーバンドして不自然に見えるのを防ぐ
        // （refreshControl があるシートは pull-to-refresh のジェスチャーに
        // bounce が要るので対象外）。
        alwaysBounceVertical={refreshControl ? undefined : false}
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
