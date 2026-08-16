import { StyleSheet, View } from "react-native";

import { type Theme, useThemedStyles } from "@/lib/theme";

// 横に並ぶ要素の区切り（web の components/inline-divider.tsx と同じ 1px 縦棒・
// 前景色の α 10%）。"/" や "・" のテキスト区切りは使わない（ui-guidelines）。
export function InlineDivider() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.divider} />;
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    divider: { width: 1, height: 12, backgroundColor: t.fgAlpha(0.1) },
  });
