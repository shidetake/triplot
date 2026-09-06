import { useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { type Theme, useThemedStyles } from "@/lib/theme";

// 一覧の行を左スワイプで消せるようにする器（iOS だけ。web にスワイプは無い）。
//
// 少し引くと赤い面が出てタップで消す（2手）。**引き切ると一手で消える。**
// 一手で消せるのは、消した後にトーストから元に戻せる一覧だけに付ける
// （docs/ui-guidelines.md「確認もアンドゥも無いなら、一手で消せないように
// する」）。2手の経路を残すのは、引き切るのが知っている人の近道であって、
// 知らない人の唯一の道にはしないため。
//
// **同じ仕草をどの一覧でも同じ手触りにするため、器はこの1つに集約する。**
// 覚えた仕草が一覧ごとに違う効き方をすると、覚える価値が無くなる。

// 赤い面の既定の幅（文字が収まる分）。
const ACTION_W = 88;

// 引き切ったと見なす割合（行の幅に対して）。iOS 標準の一覧と同じ感覚。
const FULL_SWIPE_RATIO = 0.5;

export function SwipeDeleteRow({
  onDelete,
  label,
  style,
  children,
}: {
  onDelete: () => void;
  // 赤い面に出す文言（「削除」「破棄」）。読み上げ名も兼ねる。
  label: string;
  // 行の見た目。**地色を必ず持たせること** — 透明だと下の赤い面が透ける。
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  // 引き切ったと見なす距離は**行の幅から導く**（画面の広さで手の動きが変わる
  // ので、固定の px だと狭い端末では遠すぎ、広い端末では近すぎる）。測れるまでは
  // 発動しない（Infinity）。
  const [rowWidth, setRowWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== rowWidth) setRowWidth(w);
  };
  const fullSwipeAt = rowWidth > 0 ? rowWidth * FULL_SWIPE_RATIO : Infinity;
  // 今引き切っているか。描画には使わないので state ではなく ref
  // （毎フレーム再描画しない）。
  const armedRef = useRef(false);

  return (
    <Swipeable
      // 指に 1:1 で付いてくる（iOS 標準の一覧と同じ）。**追従を鈍らせると
      // 引き切る判定と覆い切る見た目が両立しない**: 指が半分しか効かないので、
      // 行を端まで引いても面は行の半分までしか広がらない（実測: friction 2 では
      // 画面端から端まで引いても発動しなかった）。
      friction={1}
      rightThreshold={40}
      overshootRight
      onSwipeableWillOpen={() => {
        if (!armedRef.current) return;
        armedRef.current = false;
        onDelete();
      }}
      renderRightActions={(_progress, translation) => (
        <SwipeAction
          translation={translation}
          fullSwipeAt={fullSwipeAt}
          onArmedChange={(armed) => {
            armedRef.current = armed;
          }}
          onPress={onDelete}
          label={label}
          styles={styles}
        />
      )}
    >
      <View style={style} onLayout={onLayout}>
        {children}
      </View>
    </Swipeable>
  );
}

// 引くほど広がり、**引き切ると行を覆う**（iOS 標準の一覧と同じ見た目）。
// 覆い切ったことが目で分かるので、指を離すと消えることが離す前に伝わる。
function SwipeAction({
  translation,
  fullSwipeAt,
  onArmedChange,
  onPress,
  label,
  styles,
}: {
  // 行の水平方向のずれ（右から出す＝左スワイプなので負）。
  translation: SharedValue<number>;
  fullSwipeAt: number;
  onArmedChange: (armed: boolean) => void;
  onPress: () => void;
  label: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  // 越えた／戻ったを JS 側にまとめて伝える（worklet から呼ぶのは1つだけ）。
  const armedChanged = (armed: boolean) => {
    onArmedChange(armed);
    // 引き切った瞬間に手で知らせる。指が赤い面の上にあって画面が見えていない
    // ことがあるので、目だけの合図では足りない。**戻した時にも鳴らす** —
    // 「もう離しても消えない」も同じくらい知りたい報せで、片道だと案内に
    // ならない。
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };
  useAnimatedReaction(
    () => -translation.value >= fullSwipeAt,
    (next, prev) => {
      if (next !== prev) runOnJS(armedChanged)(next);
    },
  );
  const style = useAnimatedStyle(() => ({
    width: Math.max(ACTION_W, -translation.value),
  }));
  return (
    <Animated.View style={[styles.action, style]}>
      <Pressable
        onPress={onPress}
        style={styles.hit}
        accessibilityLabel={label}
      >
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // iOS 標準の一覧と同じく赤い面に白文字。引き切って行を覆う時に備え、
    // 面は横並び＋文字は左端側に固定する（面が広がっても文字が画面外へ
    // 流れていかない）。
    action: {
      flexDirection: "row",
      alignItems: "stretch",
      backgroundColor: t.destructiveText,
    },
    hit: {
      width: ACTION_W,
      justifyContent: "center",
      alignItems: "center",
    },
    label: { fontSize: 14, color: "#fff", fontWeight: "500" },
  });
