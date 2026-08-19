import { type ReactNode } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

import { type Theme, useThemedStyles } from "@/lib/theme";

// 「既に formSheet として開いている画面の中から、さらに開くピッカー」用の器。
// 通貨選択・コピー元選択の2つが使う。
//
// RN の Modal(presentationStyle="pageSheet") は iOS の UIModalPresentationPageSheet
// を使う実物の native シート（他の formSheet と同じ「本物」）だが、
// react-native-screens の sheetAllowedDetents / sheetGrabberVisible のような
// 新しい API とは別物で、**取っ手や見出しの見た目は自前で揃える必要がある**。
// formSheet の中にさらに ScreenStack を入れ子にすると元の画面と二重露光のように
// 重なる実機不具合があるため、この場面だけこちらを使う
// （docs/ui-guidelines.md「RN のシート（ボトムシート）は必ず OS ネイティブの
// ものを使う」の表の2番）。
//
// 見た目を各所で書くと片方だけずれる（実際コピー元選択だけ取っ手が無く見出しも
// 左寄せになっていた）ので、器はここに1つだけ置く。× は付けない——他の native
// シートと同じくスワイプで閉じる。
export function PageSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        {/* 取っ手（native formSheet の sheetGrabberVisible と同じ見た目）。 */}
        <View style={styles.grabberRow}>
          <View style={styles.grabber} />
        </View>
        {/* 見出しは SheetTitle（他のシート）と同じ 17px・中央寄せ。 */}
        <Text style={styles.title}>{title}</Text>
        {children}
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: t.background },
    grabberRow: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
    grabber: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: t.fgAlpha(0.2),
    },
    title: {
      fontSize: 17,
      fontWeight: "600",
      color: t.foreground,
      textAlign: "center",
      paddingBottom: 14,
    },
  });
