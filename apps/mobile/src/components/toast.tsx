import { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/lib/theme";

// グローバルなトースト。ui-guidelines「フィードバック」節の方針:
// 結果が見えない成功（コピー等）を画面下に短く出す。どこからでも
// toast("コピーしました") で呼べる。RN には Base UI Toast 相当が無いので
// 最小限を自前で持つ（web の standalone manager パターンと同じだが、
// 後述の理由で「今手前にある Toaster」に届ける必要がある）。
// アクションは不要＝スワイプ/ボタンでの
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
// 配送先は**マウント順ではなく種類**で決める: シート内の Toaster が1つでも
// マウントされていれば、その回はシート内だけに配る。シートは常にルートの上に
// あるので、開いていればそちらが手前だと種類だけで決まる。
//
// 「全部に配る」ではない。fitToContents のシートは画面の一部しか覆わないので、
// ルートのトースト（下寄せ）がシートの外・シートの地の裏に見えてしまい、
// 同じトーストが2箇所に出る（実機フィードバック）。
//
// マウント順を当てにする実装は壊れるので戻さないこと: 以前は listener を
// スタックに積んで最後尾＝手前と見なしていたが、ディープリンクで受信箱を
// 直接開くとルートと画面が同時にマウントされ、エフェクトが子→親の順に走る
// ためルートが最後尾になり、トーストがシートの裏に配送されて何も出なかった。

type Listener = { show: (text: string | null) => void; inSheet: boolean };
const listeners = new Set<Listener>();
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(text: string): void {
  if (hideTimer) clearTimeout(hideTimer);
  const all = [...listeners];
  const inSheet = all.filter((l) => l.inSheet);
  // シートが開いていればシート内だけ。開いていなければルート（＝残り全部）。
  const targets = inSheet.length > 0 ? inSheet : all;
  for (const l of targets) l.show(text);
  hideTimer = setTimeout(() => {
    for (const l of targets) l.show(null);
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
    const listener: Listener = {
      inSheet,
      show: (text) => {
        if (text) {
          setDisplayText(text);
          setShown(true);
        } else {
          setShown(false);
        }
      },
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [inSheet]);

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
        // シート内の上端は grabber の下（シートに status bar は無いので
        // safe area は足さない）。24 は実測値: grabber はシート上端から
        // 5pt の位置に高さ 5pt で描かれるので、12 だと下端の 1pt 下に
        // 詰まって grabber の一部に見えた（実機フィードバック）。
        // 画面全体のときだけ下端の safe area を避ける。
        inSheet ? { top: 24 } : { bottom: insets.bottom + 24 },
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
