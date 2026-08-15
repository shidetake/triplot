import { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/lib/theme";

// グローバルなトースト。ui-guidelines「フィードバック」節の方針:
// 結果が見えない成功（コピー等）を画面下に短く出す。どこからでも
// toast("コピーしました") で呼べる。RN には Base UI Toast 相当が無いので
// 最小限を自前で持つ（listener のスタック方式。web の standalone manager
// パターンと同じだが、後述の理由で「今アクティブな画面のどれか」に届ける
// 必要があるためスタックにしている）。アクションは不要＝スワイプ/ボタンでの
// 明示クローズは持たず、一定時間で自動的に消える（ブロッキングしない
// Alert.alert の代替）。
//
// <Toaster /> はルート（app/_layout.tsx）に1つ常設するが、それだけでは
// 足りない: 受信箱・旅行編集等は react-native-screens の native-stack
// presentation:"formSheet" で開く別の view controller であり、ルート直下の
// 兄弟 View はその中には実機で描画されない（シミュレータでは偶然表に出る
// ことがあるが、実機 TestFlight では出ない＝実機フィードバックで判明。
// @gorhom/bottom-sheet ベースの独自シートとは別の仕組みなので、そちらの
// 対策は効かない）。そのため toast() を使う formSheet 画面は、その画面
// 自身の return 内にも直接 <Toaster /> を置く（apps/mobile/src/app/(app)/
// trips/inbox.tsx, .../[tripId]/edit.tsx 参照）。画面が有効な間だけそちらの
// listener がスタックの最後尾に積まれ、toast() はスタックの末尾（＝一番
// 手前で今アクティブな Toaster）だけに届ける。

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
