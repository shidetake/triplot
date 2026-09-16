import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import type { CategoryAmount } from "@triplot/shared/expenseSummary";
import type { Category } from "@triplot/shared/tripDerive";
import { NEUTRAL, roleColorFromHex } from "@triplot/shared/colorRoles";
import { donutSegments } from "@triplot/shared/donutSegments";

import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// カテゴリ別の円グラフ（ドーナツ）。web の components/expense-donut.tsx と
// 同じ寸法・同じ図形（弧の計算は @triplot/shared/donutSegments で共通）。
const SIZE = 108;
const STROKE = 20;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 3;

function categoryColor(color: string | undefined, dark: boolean): string {
  const pair = roleColorFromHex(color, "solid") ?? NEUTRAL.solid;
  return dark ? pair.dark : pair.light;
}

export function ExpenseDonut({
  amounts,
  pick,
  categoryById,
  label,
}: {
  amounts: CategoryAmount[];
  pick: (c: CategoryAmount) => number;
  categoryById: Map<string, Category>;
  label: string;
}) {
  const t = useTheme();
  const segments = donutSegments(
    amounts.map((a) => ({ key: a.categoryId, value: pick(a) })),
    { circumference: CIRCUMFERENCE, gapPx: GAP },
  );

  return (
    <Svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      {/* 12時から時計回りに描く（web と同じ SVG の変換）。 */}
      <G transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
        {segments.length === 0 ? (
          // 費用がまだ無いときも輪だけ出す（図の場所が動かない）。
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={t.fgAlpha(0.1)}
            strokeWidth={STROKE}
          />
        ) : (
          segments.map((s) => (
            <Circle
              key={s.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={categoryColor(categoryById.get(s.key)?.color, t.dark)}
              strokeWidth={STROKE}
              strokeDasharray={`${s.dash} ${CIRCUMFERENCE - s.dash}`}
              strokeDashoffset={s.offset}
            />
          ))
        )}
      </G>
    </Svg>
  );
}

// 2つの図で共用する凡例。色だけで identity を運ばない（隣り合うカテゴリ色が
// 見分けられないことがあるので、名前を必ず添える）。
export function ExpenseDonutLegend({
  amounts,
  categoryById,
}: {
  amounts: CategoryAmount[];
  categoryById: Map<string, Category>;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (amounts.length === 0) return null;
  return (
    <View style={styles.legend}>
      {amounts.map((a) => {
        const cat = categoryById.get(a.categoryId);
        return (
          <View key={a.categoryId} style={styles.legendItem}>
            <View
              style={[
                styles.dot,
                { backgroundColor: categoryColor(cat?.color, t.dark) },
              ]}
            />
            <Text style={styles.legendText}>{cat?.name ?? "?"}</Text>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      columnGap: 12,
      rowGap: 4,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 12, color: t.mutedForeground },
  });
