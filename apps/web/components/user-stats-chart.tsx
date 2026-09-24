import { getLocale, getTranslations } from "next-intl/server";

import { formatDayLabel } from "@triplot/shared/schedule";

export type UserStatsRow = {
  day: string;
  registeredCount: number;
  /** 過去分は算出できないので null（record_daily_user_stats のバックフィル参照）。 */
  activeCount: number | null;
};

// 登録ユーザー数（累積）・アクティブユーザー数（半年ローリング）の推移。
// ライブラリを足すほどの図ではないので inline SVG で自前描画する
// （AiUsageChart の棒グラフと同じ判断。ui-guidelines の部品フロー参照）。
//
// 2系列は色だけで見分けさせず、線種（実線/破線）も変える
// （色覚多様性への配慮。凡例に色+ラベルの両方を出す）。
// 縦軸は「人数」で共通の1軸（別スケールにしない＝ダブル軸グラフを作らない）。
export async function UserStatsChart({ rows }: { rows: UserStatsRow[] }) {
  const t = await getTranslations("admin");
  const locale = await getLocale();

  const n = rows.length;
  const activePoints = rows
    .map((r, i) => ({ i, v: r.activeCount }))
    .filter((p): p is { i: number; v: number } => p.v !== null);

  const maxValue = Math.max(
    1,
    ...rows.map((r) => r.registeredCount),
    ...activePoints.map((p) => p.v),
  );

  const W = 300;
  const H = 100;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 6;
  const usableH = H - PAD_TOP - PAD_BOTTOM;
  const xFor = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const yFor = (v: number) => PAD_TOP + usableH - (v / maxValue) * usableH;

  const registeredPath = rows
    .map((r, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(r.registeredCount)}`)
    .join(" ");

  // active は欠けている区間があるので、連続する区間ごとに別パスへ分ける。
  const activeSegments: { i: number; v: number }[][] = [];
  for (const p of activePoints) {
    const last = activeSegments[activeSegments.length - 1];
    if (last && last[last.length - 1]!.i === p.i - 1) {
      last.push(p);
    } else {
      activeSegments.push([p]);
    }
  }

  return (
    <div className="mt-2">
      {/* 凡例: 色だけに頼らず線種も併記する。 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-foreground" />
          {t("usersTrendRegistered")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-blue-600 dark:border-blue-400" />
          {t("usersTrendActive")}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 h-24 w-full"
        role="img"
        aria-label={t("usersTrendHeading")}
      >
        <path
          d={registeredPath}
          fill="none"
          className="stroke-foreground"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {activeSegments.map((seg) =>
          seg.length === 1 ? (
            <circle
              key={seg[0]!.i}
              cx={xFor(seg[0]!.i)}
              cy={yFor(seg[0]!.v)}
              r="2"
              className="fill-blue-600 dark:fill-blue-400"
            />
          ) : (
            <path
              key={seg[0]!.i}
              d={seg
                .map((p, idx) => `${idx === 0 ? "M" : "L"}${xFor(p.i)},${yFor(p.v)}`)
                .join(" ")}
              fill="none"
              className="stroke-blue-600 dark:stroke-blue-400"
              strokeWidth="2"
              strokeDasharray="4 3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
      </svg>

      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{formatDayLabel(rows[0]!.day, locale)}</span>
        <span>{formatDayLabel(rows[n - 1]!.day, locale)}</span>
      </div>
    </div>
  );
}
