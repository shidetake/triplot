import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { MOBILE_TAB_BAR_TOP } from "@/lib/layout";
import { useTheme } from "@/lib/theme";

// グローバルなトースト。ui-guidelines「フィードバック」節の方針:
// 結果が見えない成功（コピー等）を画面下に短く出す。どこからでも
// toast("コピーしました") で呼べる。RN には Base UI Toast 相当が無いので
// 最小限を自前で持つ（web の standalone manager パターンと同じだが、
// 後述の理由で「今手前にある Toaster」に届ける必要がある）。
// スワイプ/ボタンでの明示クローズは持たず、一定時間で自動的に消える
// （ブロッキングしない Alert.alert の代替）。
//
// アクション（「元に戻す」等）は任意で付けられる。取り消せる操作は、確認を
// 挟むより済ませてから戻せる方が手数が少ない（ui-guidelines「確認の要否は
// 復旧コストで決める」＝確認とアンドゥは同じ問題への2つの答え）。アクションが
// 有る回だけ帯がタップを受ける（無い回は下の要素を邪魔しない）。
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

export type ToastAction = { label: string; onPress: () => void };

type Shown = { text: string; action: ToastAction | null };
type Listener = { show: (next: Shown | null) => void; inSheet: boolean };
const listeners = new Set<Listener>();
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(text: string, action?: ToastAction): void {
  if (hideTimer) clearTimeout(hideTimer);
  const all = [...listeners];
  const inSheet = all.filter((l) => l.inSheet);
  // シートが開いていればシート内だけ。開いていなければルート（＝残り全部）。
  const targets = inSheet.length > 0 ? inSheet : all;
  // アクションを押したら、その場で引っ込める（押した後も残っていると二度押せる）。
  const wrapped: ToastAction | null = action
    ? {
        label: action.label,
        onPress: () => {
          hideNow(targets);
          action.onPress();
        },
      }
    : null;
  for (const l of targets) l.show({ text, action: wrapped });
  hideTimer = setTimeout(() => hideNow(targets), DISPLAY_MS);
}

function hideNow(targets: Listener[]): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  for (const l of targets) l.show(null);
}

// アクション（「元に戻す」）を押す間を与える必要があるので、web の Base UI の
// 既定（5秒）に合わせる。押させる相手がいるトーストだけ長くする、という
// 作り分けはしない — 同じ部品が回ごとに違う長さで消えると、消えるまでの間が
// 読めなくなる。
const DISPLAY_MS = 5000;
const FADE_MS = 200;

// inSheet: この Toaster が native の formSheet ルートの中にあるか。
//
// **シートの中では下寄せが画面に出ない。** 常時表示の bottom 基準の probe を
// 置いても、シートが中身の高さのときも画面いっぱいのときも、どこにも現れない
// （同時に描いた top 基準のものはシート上端に出る）。器の View に flex:1 を
// 与えて高さを確定させても変わらなかったので、「器の高さが 0 だから」でも
// ない。原因は特定できていないが、**下寄せは使えない**ことは3回測って同じ
// 結果なので、上端に出す。
//
// 位置の既定は本来「画面下中央」（ui-guidelines「トースト」節）で、
// 上端はこの制約による代替。シートが開いている間はシートが目の前の面なので、
// その上端に出る帯として読める、という意味では破綻しない。ルート（画面全体）は
// 従来どおり下中央。
export function Toaster({ inSheet = false }: { inSheet?: boolean }) {
  const [displayed, setDisplayed] = useState<Shown | null>(null);
  const [shown, setShown] = useState(false);
  const [opacity] = useState(() => new Animated.Value(0));
  const theme = useTheme();

  useEffect(() => {
    const listener: Listener = {
      inSheet,
      show: (next) => {
        if (next) {
          setDisplayed(next);
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
    if (!displayed) return;
    Animated.timing(opacity, {
      toValue: shown ? 1 : 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !shown) setDisplayed(null);
    });
  }, [displayed, shown, opacity]);

  if (!displayed) return null;

  return (
    <Animated.View
      // アクションが有る回だけタップを受ける。無い回は今までどおり素通しで、
      // トーストの下にあるものを押せなくしない。
      pointerEvents={displayed.action ? "box-none" : "none"}
      style={[
        styles.wrap,
        // シート内の上端は grabber の下（シートに status bar は無いので
        // safe area は足さない）。24 は実測値: grabber はシート上端から
        // 5pt の位置に高さ 5pt で描かれるので、12 だと下端の 1pt 下に
        // 詰まって grabber の一部に見えた（実機フィードバック）。
        //
        // 画面全体のときは、セーフエリアではなくタブバー（iOS 26 Liquid
        // Glass の浮島。RN の flex の外に浮くので高さを取得できない）を
        // 避ける。セーフエリア基準（insets.bottom+24）だと画面下から約58pt
        // になり、タブバー上端の実測約83ptの帯に半端に重なって見た目が悪い
        // （実機フィードバック）。MOBILE_TAB_BAR_TOP から確実に上へ出す。
        inSheet ? { top: 24 } : { bottom: MOBILE_TAB_BAR_TOP + 17 },
        { opacity },
      ]}
    >
      <View style={[styles.toast, { backgroundColor: theme.primary }]}>
        <Text
          style={[
            styles.text,
            styles.textFlex,
            { color: theme.primaryForeground },
          ]}
          numberOfLines={2}
        >
          {displayed.text}
        </Text>
        {displayed.action && (
          <Pressable
            onPress={displayed.action.onPress}
            // 文字の高さ（14pt）だけでは HIG の 44pt に届かないので広げる。
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={displayed.action.label}
          >
            <Text
              style={[styles.action, { color: theme.primaryForeground }]}
              numberOfLines={1}
            >
              {displayed.action.label}
            </Text>
          </Pressable>
        )}
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
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    maxWidth: "90%",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: {
    fontSize: 14,
  },
  // アクションが有るときだけ本文が伸び縮みする（無い回は今までどおり内容幅）。
  textFlex: {
    flexShrink: 1,
  },
  action: {
    fontSize: 14,
    fontWeight: "500",
  },
});
