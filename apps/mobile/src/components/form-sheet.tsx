import {
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from "react";
import { StyleSheet } from "react-native";
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
  { children: (dismiss: () => void) => ReactNode }
>(function FormSheet({ children }, ref) {
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
      snapPoints={["100%"]}
      // 100% はこの topInset を引いた残り＝シート上端がヘッダー帯の下端に揃う。
      topInset={insets.top + NAV_BAR_HEIGHT}
      enableDynamicSizing={false}
      // 背景は薄暗く（モーダル）＋ドラッグで閉じ。上に元画面が残る。
      backdropComponent={undefined}
      backgroundStyle={{ backgroundColor: t.background }}
      handleIndicatorStyle={{ backgroundColor: t.fgAlpha(0.2) }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {children(dismiss)}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
});
