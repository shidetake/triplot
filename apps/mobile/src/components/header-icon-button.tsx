import { forwardRef, type ReactNode } from "react";
import { Pressable, StyleSheet, type View } from "react-native";

// ナビバー右のアイコンボタン共通部品。iOS 26 はヘッダー項目をガラスの
// カプセルで包むが、素の 20px アイコンだけ置くとカプセルがグリフに密着して
// 窮屈に見える（ネイティブのバーボタンは 44pt 級のタップ領域を持つ）。
// ボタン自身に padding を持たせてタップ領域とカプセル内の余白を確保し、
// 全画面でギア等の位置が揃うよう単一部品にする。
export const HeaderIconButton = forwardRef<
  View,
  {
    children: ReactNode;
    accessibilityLabel: string;
    onPress?: () => void;
  }
>(function HeaderIconButton({ children, accessibilityLabel, onPress }, ref) {
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={styles.button}
    >
      {children}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  button: { padding: 10, alignItems: "center", justifyContent: "center" },
});
