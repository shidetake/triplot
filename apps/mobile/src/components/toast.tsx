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
// ことがあるが、実機 TestFlight では出ない＝実機フィードバックで判明）。
// そのため toast() を使う formSheet 画面は、その画面自身の return 内にも
// 直接 <Toaster /> を置く（apps/mobile/src/app/(app)/trips/import.tsx,
// .../trips/trip-edit.tsx 参照）。
//
// toast() は「今どれが手前か」を判定せず、**全ての Toaster に配る**。
// 手前でない Toaster が描いたぶんは別の view controller の裏に隠れて
// 見えないだけなので害がなく、逆に「手前を当てにいく」実装は壊れる:
// 以前は listener をスタックに積んで最後尾＝手前と見なしていたが、
// ディープリンクで受信箱を直接開くとルートと画面が同時にマウントされ、
// エフェクトが子→親の順に走るためルートが最後尾になり、トーストが
// シートの裏に配送されて何も出なかった（マウント順に依存していたのが原因）。

type Listener = (text: string | null) => void;
const listeners = new Set<Listener>();
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(text: string): void {
  if (hideTimer) clearTimeout(hideTimer);
  for (const fn of listeners) fn(text);
  hideTimer = setTimeout(() => {
    for (const fn of listeners) fn(null);
  }, DISPLAY_MS);
}

const DISPLAY_MS = 2500;
const FADE_MS = 200;

// inSheet: この Toaster が native の formSheet ルートの中にあるか。
// シートの中は下寄せにできない。sheetAllowedDetents:"fitToContents" の
// シートでは画面の View が「見えているシート」より下まで伸びていて、
// bottom 基準だと見えない位置に出る（実測: top 基準の probe はシート上端に
// 出るのに、同時に描いた bottom 基準の probe はどこにも出ない）。
// そのためシート内は上端に出す。ルート（画面全体）は従来どおり下中央
// （ui-guidelines「トースト」節）。
export function Toaster({ inSheet = false }: { inSheet?: boolean }) {
  const [displayText, setDisplayText] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [opacity] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  useEffect(() => {
    const fn: Listener = (text) => {
      if (text) {
        setDisplayText(text);
        setShown(true);
      } else {
        setShown(false);
      }
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  // フェードは state を変えたその場ではなく、描画後のこの effect で開始する。
  // toast() と同じ tick で start() すると、Animated.View がまだマウント
  // されていない＝ネイティブのビューが繋がっていない状態で useNativeDriver の
  // アニメーションが走り始める。useNativeDriver は JS 側の値を更新しないので、
  // 後からマウントしたビューが初期値 0 を読んで透明なままになり得る。
  useEffect(() => {
    if (!displayText) return;
    Animated.timing(opacity, {
      toValue: shown ? 1 : 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !shown) setDisplayText(null);
    });
  }, [displayText, shown, opacity]);

  if (!displayText) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        // シート内の上端は grabber のすぐ下（シートに status bar は無いので
        // safe area は足さない）。画面全体のときだけ下端の safe area を避ける。
        inSheet ? { top: 12 } : { bottom: insets.bottom + 24 },
        { opacity },
      ]}
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
