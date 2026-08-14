import { useEffect, useState } from "react";
import { Animated, Modal, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/lib/theme";

// グローバルなトースト。ui-guidelines「フィードバック」節の方針:
// 結果が見えない成功（コピー等）を画面下に短く出す。どこからでも
// toast("コピーしました") で呼べる。<Toaster /> をルートに1つだけ置く
// （web の components/toast.tsx と同じ standalone manager パターン。
// RN には Base UI Toast 相当が無いので最小限を自前で持つ）。
// アクションは不要＝スワイプ/ボタンでの明示クローズは持たず、一定時間で
// 自動的に消える（ブロッキングしない Alert.alert の代替）。

const DISPLAY_MS = 2500;
const FADE_MS = 200;

type Listener = (text: string | null) => void;
let listener: Listener | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(text: string): void {
  if (hideTimer) clearTimeout(hideTimer);
  listener?.(text);
  hideTimer = setTimeout(() => listener?.(null), DISPLAY_MS);
}

export function Toaster() {
  const [displayText, setDisplayText] = useState<string | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  useEffect(() => {
    listener = (text) => {
      if (text) {
        setDisplayText(text);
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start(() => setDisplayText(null));
      }
    };
    return () => {
      listener = null;
    };
  }, [opacity]);

  if (!displayText) return null;

  return (
    // ボトムシート（@gorhom/bottom-sheet）は独自のポータル層に乗るため、通常の
    // 兄弟 View では JSX の並び順に関わらずシートの裏に隠れる（実機フィード
    // バック: 受信箱シートを開いた状態でコピーすると、トーストがシートの下に
    // 出て読めない）。ネイティブの Modal は新しい UIWindow に乗るので、開いて
    // いるシートより後に出せば確実に最前面になる。タップは全て下へ通す
    // （pointerEvents="none" をカスケードさせ、通知はブロッキングしない）。
    <Modal transparent visible animationType="none" statusBarTranslucent>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { bottom: insets.bottom + 24, opacity }]}
        >
          <View style={[styles.toast, { backgroundColor: theme.primary }]}>
            <Text
              style={[styles.text, { color: theme.primaryForeground }]}
              numberOfLines={2}
            >
              {displayText}
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toast: {
    maxWidth: "90%",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: {
    fontSize: 14,
  },
});
