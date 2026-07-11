import { useMemo } from "react";
import { useColorScheme } from "react-native";

// web の globals.css のテーマトークン（oklch）を sRGB に焼き込んだ同値。
// テキスト/アイコンの中間色は半透明にしない（SVG のパスが重なる箇所で透明度が
// 二重にかかり黒ずむため。web も濃度を不透明値に焼き込んでいる）。
// ボーダー・hover 面だけは web と同じ「前景色の α 重ね」（fgAlpha）。
// セマンティック色（red/amber）の dark は ui-guidelines の「同色相の α 重ね」写像。
export const lightTheme = {
  dark: false,
  background: "#ffffff", // --background
  foreground: "#212121", // --foreground oklch(0.248) = 白地87%黒
  mutedForeground: "#666666", // --muted-foreground oklch(0.510) = 60%
  subtleForeground: "#9e9e9e", // --subtle-foreground oklch(0.699) = 38%
  primary: "#171717", // --primary oklch(0.205)
  primaryForeground: "#fafafa", // --primary-foreground oklch(0.985)
  secondary: "#f5f5f5", // --secondary/--muted/--accent oklch(0.97)
  // 前景色の α 重ね（ボーダー階段・hover/選択面）。
  fgAlpha: (a: number) => `rgba(0,0,0,${a})`,
  // destructive（削除ボタン: red-600 と枠 /20）
  destructiveText: "#dc2626",
  destructiveBorder: "rgba(220,38,38,0.2)",
  // エラー面（bg-red-50 / text-red-700〜900 相当）
  errorBg: "#fef2f2",
  errorText: "#b91c1c",
  // 警告 amber（面=50・枠=200・面上の文字=900・地の文字=700・塗りチップ=100）
  warnBg: "#fffbeb",
  warnBorder: "#fde68a",
  warnText: "#78350f",
  warnAccent: "#b45309",
  warnChipBg: "#fef3c7",
};

export type Theme = typeof lightTheme;

export const darkTheme: Theme = {
  dark: true,
  background: "#0a0a0a", // .dark --background oklch(0.145)
  foreground: "#fafafa",
  mutedForeground: "#a1a1a1", // oklch(0.708)
  subtleForeground: "#a1a1a1", // dark は muted と同値（web と同じ）
  primary: "#e5e5e5", // .dark --primary oklch(0.922)
  primaryForeground: "#171717",
  secondary: "#262626", // oklch(0.269)
  fgAlpha: (a: number) => `rgba(255,255,255,${a})`,
  destructiveText: "#f87171", // red-400
  destructiveBorder: "rgba(248,113,113,0.2)",
  errorBg: "rgba(248,113,113,0.1)", // red-400/10
  errorText: "#fca5a5", // red-300
  warnBg: "rgba(251,191,36,0.1)", // amber-400/10
  warnBorder: "rgba(251,191,36,0.2)",
  warnText: "#fcd34d", // amber-300
  warnAccent: "#fbbf24", // amber-400
  warnChipBg: "rgba(251,191,36,0.2)",
};

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? darkTheme : lightTheme;
}

// StyleSheet をテーマ関数化する時の定型。ファイル末尾に
// `const makeStyles = (t: Theme) => StyleSheet.create({...})` を置き、
// コンポーネント側で `const styles = useThemedStyles(makeStyles)`。
export function useThemedStyles<T>(make: (t: Theme) => T): T {
  const t = useTheme();
  return useMemo(() => make(t), [make, t]);
}
