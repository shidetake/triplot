import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTranslations } from "use-intl";

import { XIcon } from "@/components/icons";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// **初めての人にだけ出す案内**（docs/ui-guidelines.md「初めての人にだけ出す案内」）。
//
// 出すかどうかは呼ぶ側が**状態**で決める（その機能が今この画面で意味を持つか ×
// その人がまだ使っていないか）。出来事をきっかけに出すと、その瞬間に画面を見て
// いた人にしか届かない——あとから開いた人には何も起きない。
//
// ## OS のポップオーバーを使っていない理由
//
// iOS の `.popover()` は矢印まで OS が描くが、**矢印の幅と形を変える口が無い**
// （`UIPopoverPresentationController` が描き、外に出ているのは「どの辺から
// 出すか」だけ）。既定の矢印は幅が広く、24pt のアバターを指すには重い。しかも
// 幅が広いぶん、角の丸みに掛からない位置まで右へ逃がさないと角が描かれず、
// **そうすると指したい相手からずれる**（実機で両方見て確認）。
//
// 指す先が画面の隅に固定されているこの案内では、OS からもらえるもののうち効く
// のは「外をタップで閉じる」だけで、それは自前でも同じものになる。画面端での
// 回り込みも、位置が動かないので要らない。だから**ここだけは自分で描く**
// （別の場所に吹き出しを足す時は、まず OS の方を試すこと）。
export function FirstRunTip({
  visible,
  title,
  text,
  onDismiss,
  pointAtX,
  top,
}: {
  visible: boolean;
  // 見出し＝ここで何ができるか（短く）。本文＝なぜ今それが出ているか。
  // Apple の TipKit と同じ2段。1段だけだと状況の説明が先に来て、何ができる
  // のかが後ろに埋もれる。
  title: string;
  text: string;
  onDismiss: () => void;
  // 指す相手の中心（カレンダーの中の座標）。矢印の先がここに来る。
  pointAtX: number;
  top: number;
}) {
  const t = useTranslations("common");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!visible) return null;
  return (
    <View style={[styles.wrap, { top }]}>
      <View style={styles.bubble}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.text}>{text}</Text>
        <Pressable
          onPress={onDismiss}
          accessibilityLabel={t("close")}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.close}
        >
          <XIcon size={14} color={theme.mutedForeground} />
        </Pressable>
      </View>
      {/* 矢印は細く短く。**先が指す相手の中心に来て、かつ角の丸みに掛からない**
          ことの両方が要るので、器の左端はその分だけ内側に寄せてある（LEFT）。
          器の後に描く＝底の1ptが器の枠線に重なって、継ぎ目が消える。 */}
      <View style={[styles.arrow, { left: pointAtX - LEFT - ARROW_W / 2 }]}>
        <Svg width={ARROW_W} height={ARROW_H + 1}>
          {/* 斜めの2辺だけ線を引く（底は引かない＝器との境目が出ない）。
              線が無いと、白い面の上で白い三角が消える（実機で確認）。 */}
          <Path
            d={`M0 ${ARROW_H + 1} L${ARROW_W / 2} 0.5 L${ARROW_W} ${ARROW_H + 1}`}
            fill={theme.dark ? theme.secondary : theme.background}
            stroke={theme.fgAlpha(0.12)}
            strokeWidth={0.5}
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </View>
  );
}

const LEFT = 6; // 器の左端（画面端からの余白）
const WIDTH = 244;
const RADIUS = 10;
const ARROW_W = 10;
const ARROW_H = 7;

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { position: "absolute", left: LEFT, width: WIDTH, zIndex: 20 },
    // 器にも髪の毛の枠線を引く（矢印と揃える）。浮きは影と、暗い地では一段
    // 明るい面で出す。
    arrow: { position: "absolute", top: -ARROW_H },
    bubble: {
      backgroundColor: t.dark ? t.secondary : t.background,
      borderRadius: RADIUS,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.fgAlpha(0.12),
      paddingHorizontal: 14,
      paddingTop: 11,
      paddingBottom: 13,
      paddingRight: 34,
      shadowColor: "#000",
      shadowOpacity: t.dark ? 0.45 : 0.2,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    title: { fontSize: 14, fontWeight: "600", color: t.foreground },
    text: { marginTop: 3, fontSize: 12, lineHeight: 18, color: t.foreground },
    close: { position: "absolute", top: 9, right: 9 },
  });
