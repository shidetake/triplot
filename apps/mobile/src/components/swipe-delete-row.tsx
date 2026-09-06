import { useEffect, useRef, useState, type ReactNode } from "react";
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
  useSharedValue,
  withTiming,
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

// 畳む時間。跳ね返りより短くして、右へ動く前に見えなくする。
const COLLAPSE_MS = 140;

// 書き込みが失敗して行が残った時に、畳んだまま閉じ込めないための保険。
const FAILURE_RESET_MS = 4000;

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
  // 発動しない（Infinity）。高さは畳むアニメーションに使う。
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && (width !== size.w || height !== size.h)) {
      setSize({ w: width, h: height });
    }
  };
  const fullSwipeAt = size.w > 0 ? size.w * FULL_SWIPE_RATIO : Infinity;
  // 今引き切っているか。描画には使わないので state ではなく ref
  // （毎フレーム再描画しない）。
  const armedRef = useRef(false);

  // **離した瞬間に行を畳む。**
  //
  // Swipeable は指を離すと「開いた位置」（赤い面の幅）へ戻すアニメーションを
  // 走らせる。引き切った後だと行がいったん**右へ跳ね返ってから**消えるので、
  // 消えなかったように見える（実機フィードバック）。跳ね返り自体は Swipeable
  // の中の動きで止められないので、その上から行を畳んで見えなくする。
  //
  // 畳むのは書き込みの結果を待たずに行う（消えるはずのものが残っている時間を
  // 作らない）。失敗して行が残った場合に閉じ込めないよう、一定時間で元に戻す
  // ——成功していればそれより先に一覧から消えて unmount される。
  const [removing, setRemoving] = useState(false);
  const collapse = useSharedValue(1);
  useEffect(() => {
    if (!removing) return;
    const id = setTimeout(() => setRemoving(false), FAILURE_RESET_MS);
    return () => clearTimeout(id);
  }, [removing]);
  // 引き切って消す時は、**赤い面と同じ色の板で行を覆ってから畳む**。
  //
  // 指を離すと Swipeable は「開いた位置」へ戻るアニメーションを始める。面の
  // 幅を固定しても、面の**位置**がずれに追従しているので右へ動くのは止まらない
  // （実測: 左端が 52px → 136px）。止められない以上、覆って見せない。
  // 覆うのは引き切った時だけ — タップで消す時は跳ね返りが無く、覆うと逆に
  // 面が急に広がって見える。
  const [covering, setCovering] = useState(false);
  const remove = (cover: boolean) => {
    setCovering(cover);
    // 前回の途中から始めない（失敗して戻った行をもう一度消す時）。
    collapse.value = 1;
    collapse.value = withTiming(0, { duration: COLLAPSE_MS });
    setRemoving(true);
    onDelete();
  };
  const collapseStyle = useAnimatedStyle(() =>
    removing
      ? { height: size.h * collapse.value, opacity: collapse.value }
      : {},
  );

  return (
    // **畳む器は Swipeable の外側**。中に置くと畳むのが行の中身だけになり、
    // 赤い面は跳ね返りに合わせて縮み続けて「右へ戻った」ように見える。
    <Animated.View style={[styles.collapser, collapseStyle]}>
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
        // 引き切った時は面が行を覆ったまま畳む（覆い切った姿のまま消える）。
        remove(true);
      }}
      renderRightActions={(_progress, translation) => (
        <SwipeAction
          translation={translation}
          fullSwipeAt={fullSwipeAt}
          onArmedChange={(armed) => {
            armedRef.current = armed;
          }}
          onPress={() => remove(false)}
          label={label}
          styles={styles}
        />
      )}
    >
      <View style={style} onLayout={onLayout}>
        {children}
      </View>
    </Swipeable>
    {covering && (
      <View
        pointerEvents="none"
        style={[styles.action, StyleSheet.absoluteFill]}
      />
    )}
    </Animated.View>
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
    // 畳む時に中身をはみ出させない。
    collapser: { overflow: "hidden" },
  });
