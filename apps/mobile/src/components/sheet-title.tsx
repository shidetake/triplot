import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { type Theme, useThemedStyles } from "@/lib/theme";

// formSheet（持ち手付きモーダル）の画面内タイトル。formSheet はナビヘッダーを
// 出さないので、各画面がこれを先頭に置く（見た目は従来のモーダルヘッダー相当）。
export function SheetTitle({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{children}</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // 上端は持ち手（grabber）の分の余白を含む。
    wrap: { paddingTop: 18, paddingBottom: 14, alignItems: "center" },
    title: { fontSize: 17, fontWeight: "600", color: t.foreground },
  });
