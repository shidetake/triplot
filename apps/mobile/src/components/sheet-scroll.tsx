import type { ReactNode } from "react";
import { ScrollView, type StyleProp, type ViewStyle } from "react-native";

// シートの中身を載せるスクロール器。各シートルートがこれを使う。
//
// 以前は同じ ScrollView を各ルートが個別に書いていて、キーボード対応の
// プロパティが片方にしか無い状態になっていた（費用カテゴリの追加欄が
// キーボードの裏に隠れた）。器を1つにして、次に足すシートも同じ挙動になるようにする。
export function SheetScroll({
  children,
  contentContainerStyle,
  refreshControl,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ComponentProps<typeof ScrollView>["refreshControl"];
}) {
  return (
    <ScrollView
      contentContainerStyle={[{ paddingBottom: 24 }, contentContainerStyle]}
      // 候補やボタンを1タップ目で押せるようにする（1タップ目がキーボードを
      // 閉じるだけで消えない）。
      keyboardShouldPersistTaps="handled"
      // 末尾にある入力がソフトウェアキーボードに隠れないよう、下インセットを
      // 足しつつフォーカス中の入力をキーボードの上まで送る（iOS 標準挙動）。
      automaticallyAdjustKeyboardInsets
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}
