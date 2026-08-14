import { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/lib/theme";

// グローバルなトースト。ui-guidelines「フィードバック」節の方針:
// 結果が見えない成功（コピー等）を画面下に短く出す。どこからでも
// toast("コピーしました") で呼べる。<Toaster /> をルートに1つだけ置く
// （web の components/toast.tsx と同じ standalone manager パターン。
// RN には Base UI Toast 相当が無いので最小限を自前で持つ）。
// アクションは不要＝スワイプ/ボタンでの明示クローズは持たず、一定時間で
// 自動的に消える（ブロッキングしない Alert.alert の代替）。
//
// @gorhom/bottom-sheet の BottomSheetModal は自前のポータル層（rootHostName）
// に乗り、ルートの通常の兄弟 View より上に描画される。ネイティブの Modal で
// 上から被せる案も試したが、formSheet で開いている画面自体がネイティブ
// モーダルのため、二重にネイティブモーダルを重ねると描画されない（実機で
// 確認）。そのため「一番手前の Toaster が処理する」スタック方式にし、
// FormSheet（components/form-sheet.tsx）自身もローカルな <Toaster /> を
// 持つ＝シートが開いている間はシート自身の中で描画されるので、シートの
// ポータル層を出る必要が無くなる。

type Listener = (text: string | null) => void;
const listeners: Listener[] = [];
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(text: string): void {
  const top = listeners[listeners.length - 1];
  if (!top) return;
  if (hideTimer) clearTimeout(hideTimer);
  top(text);
  hideTimer = setTimeout(() => top(null), DISPLAY_MS);
}

const DISPLAY_MS = 2500;
const FADE_MS = 200;

export function Toaster() {
  const [displayText, setDisplayText] = useState<string | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  useEffect(() => {
    const fn: Listener = (text) => {
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
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }, [opacity]);

  if (!displayText) return null;

  return (
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
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
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
