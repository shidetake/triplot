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

// フォームを下からせり上がるボトムシートで出すホスト（web モバイルの vaul UX を
// RN で再現。@gorhom/bottom-sheet を使う）。呼び出し側は ref.present()/dismiss()
// で開閉する。内容は render prop で受け、閉じるための dismiss を渡す。
export type FormSheetRef = {
  present: () => void;
  dismiss: () => void;
};

export const FormSheet = forwardRef<
  FormSheetRef,
  { children: (dismiss: () => void) => ReactNode }
>(function FormSheet({ children }, ref) {
  const modalRef = useRef<BottomSheetModal>(null);
  const dismiss = useCallback(() => modalRef.current?.dismiss(), []);

  useImperativeHandle(ref, () => ({
    present: () => modalRef.current?.present(),
    dismiss,
  }));

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={["90%"]}
      enableDynamicSizing={false}
      // 背景は薄暗く（モーダル）＋ドラッグで閉じ。上に元画面が残る。
      backdropComponent={undefined}
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
