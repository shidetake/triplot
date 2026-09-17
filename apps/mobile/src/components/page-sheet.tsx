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
//
// **この API は detent を持てないので、中身が短くても高さが縮まない**
// （コピー元が1件でも画面いっぱいに出る）。react-native-screens の formSheet に
// 寄せられればここが直るが、上の二重露光は 2026-09 時点でこのリポジトリで実機
// 確認した結論であって、上流の既知 issue として報告されているかは未確認（使い方
// 次第で動く可能性は残る）。4.26.2（`~4.26.0` 指定）時点、最新安定の 4.27.0
// （2026-08-07）のリリースノートにも該当修正は無い（formSheet 関連は Android の
// 1件のみ）。Stack v5（`5.0.0-alpha` で進行中）が安定したら試し直す価値がある。
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
