import type { Category } from "@triplot/shared/tripDerive";
import type { CategoryAmount } from "@triplot/shared/expenseSummary";
import type { Currency } from "@triplot/shared/types/database";
import { NEUTRAL, roleColorFromHex } from "@triplot/shared/colorRoles";
import { donutSegments } from "@triplot/shared/donutSegments";
import { formatAmount } from "@triplot/shared/formatAmount";

import { ld } from "@/lib/themeColor";

// カテゴリ別の円グラフ（ドーナツ）。web と RN で同じ寸法・同じ図形
// （弧の計算は @triplot/shared/donutSegments）。
export const DONUT_SIZE = 108;
const STROKE = 20;
const RADIUS = (DONUT_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// 切れ目。隣り合う切れを色だけで分けさせない（ui-guidelines「費用カテゴリの色」
// はユーザーが色相を選ぶので、近い色が隣り合うことがある）。
const GAP = 3;

export function categoryColor(color: string | undefined): string {
  return ld(roleColorFromHex(color, "solid") ?? NEUTRAL.solid);
}

export function ExpenseDonut({
  amounts,
  pick,
  categoryById,
  currency,
  label,
}: {
  amounts: CategoryAmount[];
  // 個人合計の図か旅行合計の図か（並びは共通で、値だけ差し替える）。
  pick: (c: CategoryAmount) => number;
  categoryById: Map<string, Category>;
  currency: Currency;
  // 読み上げ用の図の名前（画面のラベルは下の金額が持つ）。
  label: string;
}) {
  const segments = donutSegments(
    amounts.map((a) => ({ key: a.categoryId, value: pick(a) })),
    { circumference: CIRCUMFERENCE, gapPx: GAP },
  );
  const total = amounts.reduce((s, a) => s + pick(a), 0);

  return (
    <svg
      width={DONUT_SIZE}
      height={DONUT_SIZE}
      viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
      role="img"
      aria-label={label}
    >
      {/* 12時から時計回りに描く。CSS の transform ではなく SVG の変換にする
          （CSS だと transform-origin の既定がブラウザ/RN でぶれる）。 */}
      <g transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}>
        {segments.length === 0 ? (
          // 費用がまだ無いときも輪だけ出す（図の場所が動かない）。
          <circle
            cx={DONUT_SIZE / 2}
            cy={DONUT_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-foreground/10"
          />
        ) : (
          segments.map((s) => {
            const cat = categoryById.get(s.key);
            const value = pick(
              amounts.find((a) => a.categoryId === s.key) ?? {
                categoryId: s.key,
                personal: 0,
                trip: 0,
              },
            );
            return (
              <circle
                key={s.key}
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={categoryColor(cat?.color)}
                strokeWidth={STROKE}
                strokeDasharray={`${s.dash} ${CIRCUMFERENCE - s.dash}`}
                strokeDashoffset={s.offset}
              >
                {/* 切れ目にカーソルを置いたときの内訳（凡例は名前だけなので、
                  金額と割合はここが持つ）。 */}
                <title>{`${cat?.name ?? "?"} ${formatAmount(value, currency)}${
                  total > 0 ? ` (${Math.round((value / total) * 100)}%)` : ""
                }`}</title>
              </circle>
            );
          })
        )}
      </g>
    </svg>
  );
}

// 2つの図で共用する凡例。色だけで identity を運ばない（色覚特性で隣り合う
// カテゴリ色が見分けられないことがある＝名前を必ず添える）。
export function ExpenseDonutLegend({
  amounts,
  categoryById,
}: {
  amounts: CategoryAmount[];
  categoryById: Map<string, Category>;
}) {
  if (amounts.length === 0) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1">
      {amounts.map((a) => {
        const cat = categoryById.get(a.categoryId);
        return (
          <li
            key={a.categoryId}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: categoryColor(cat?.color) }}
            />
            {cat?.name ?? "?"}
          </li>
        );
      })}
    </ul>
  );
}
