import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import type { Visibility } from "@triplot/shared/types/database";

import { type Theme, useThemedStyles } from "@/lib/theme";

// 少数の排他選択のコンパクトなセグメント。iOS でこの用途の標準は
// セグメンテッドコントロール（ラジオボタンは web の部品で iOS には無い）。
// 種別セグメント（通常/終日/時差移動）と同じ配色トークンのコンパクト版で、
// ラベルと同じ行に置ける。
export function CompactSegment<T extends string>({
  options,
  value,
  onChange,
  grow = false,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  // 全幅トラックで単独に置くとき true＝各セグメントを等幅にする（内容幅の
  // ままだと選択肢の文字数差でトラック内の左右バランスが崩れて見える）。
  grow?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.track} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === o.key }}
          style={[
            styles.item,
            grow && styles.itemGrow,
            value === o.key && styles.itemOn,
          ]}
        >
          <Text style={[styles.text, value === o.key && styles.textOn]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// 公開範囲（共有/自分のみ）の定型セグメント。
export function VisibilitySegment({
  value,
  onChange,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
}) {
  const t = useTranslations("common");
  return (
    <CompactSegment
      options={[
        { key: "shared", label: t("shared") },
        { key: "private", label: t("selfOnly") },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    track: {
      flexDirection: "row",
      // 選択肢が多く横幅を超えた場合のガード＝枠内で折り返す（見切れさせない）。
      flexWrap: "wrap",
      gap: 4,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.1),
      borderRadius: 6,
      padding: 4,
    },
    item: {
      borderRadius: 4,
      paddingVertical: 4,
      paddingHorizontal: 10,
      alignItems: "center",
    },
    itemGrow: { flex: 1 },
    itemOn: { backgroundColor: t.primary },
    text: { fontSize: 12, fontWeight: "500", color: t.mutedForeground },
    textOn: { color: t.primaryForeground },
  });
