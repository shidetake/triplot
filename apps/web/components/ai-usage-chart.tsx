"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  buildUsageBuckets,
  type DailyCount,
  type UsageGranularity,
} from "@triplot/shared/aiUsageBuckets";

// 粒度ごとに見せる本数。日は1ヶ月ぶん、週は3ヶ月ぶん、月は1年ぶん。
const BUCKET_COUNT: Record<UsageGranularity, number> = {
  day: 30,
  week: 12,
  month: 12,
};

// 管理画面の「LLM 使用量の推移」。日別の抽出通数（ai_usage_daily）を日/週/月に
// 束ねて、通数と概算コストを並べる。
//
// **切り替えはクライアント側の状態**にする。粒度は見た目の都合でしかなく、
// サーバの再取得を伴わない（元データは同じ抽出日時の一覧）。
export function AiUsageChart({
  daily,
  perEmailUsd,
}: {
  daily: DailyCount[];
  perEmailUsd: number | null;
}) {
  const t = useTranslations("admin");
  const [granularity, setGranularity] = useState<UsageGranularity>("day");
  // 「今」はマウント時に1回だけ決める。レンダーのたびに new Date() すると、
  // 日付が変わる瞬間にバケットの区切りが動いて表示が揺れる。
  const [now] = useState(() => new Date());

  const buckets = buildUsageBuckets(daily, {
    now,
    granularity,
    bucketCount: BUCKET_COUNT[granularity],
    perEmailUsd,
  });
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const totalCost = perEmailUsd === null ? null : total * perEmailUsd;
  // 棒の高さの基準。全部0のときに 0 で割らない。
  const max = Math.max(1, ...buckets.map((b) => b.count));

  const seg =
    "flex flex-1 cursor-pointer items-center justify-center rounded px-2 py-1.5 text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

  return (
    <div className="mt-4">
      <div className="flex gap-1 rounded-md border border-foreground/10 p-1">
        {(["day", "week", "month"] as const).map((g) => (
          <label
            key={g}
            className={`${seg} ${
              granularity === g
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-foreground/10"
            }`}
          >
            <input
              type="radio"
              name="granularity"
              className="sr-only"
              checked={granularity === g}
              onChange={() => setGranularity(g)}
            />
            {t(
              g === "day"
                ? "usageDaily"
                : g === "week"
                  ? "usageWeekly"
                  : "usageMonthly",
            )}
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs text-muted-foreground">
          {t("usagePeriodTotal")}
        </span>
        <span className="text-sm tabular-nums">
          {t("usageEmails", { count: total })}
        </span>
        {totalCost !== null && (
          <span className="text-sm tabular-nums">
            ≈ ${totalCost.toFixed(3)}
          </span>
        )}
      </div>

      {/* 棒グラフ。ライブラリを足すほどの図ではないので div の高さで描く
          （ui-guidelines の部品フロー: 枯れたライブラリが要るほどでもない）。 */}
      <div className="mt-3 flex h-24 items-end gap-px" aria-hidden="true">
        {buckets.map((b) => (
          <div
            key={b.start}
            className="flex-1 rounded-t bg-primary/70"
            style={{ height: `${(b.count / max) * 100}%` }}
            title={`${b.start}: ${b.count}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{buckets[0]?.start}</span>
        <span>{buckets[buckets.length - 1]?.start}</span>
      </div>

      {/* グラフは概形なので、実数は表で読めるようにする（読み上げもこちら）。 */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {t("usageBreakdown")}
        </summary>
        <ul className="mt-2 divide-y divide-foreground/10">
          {[...buckets].reverse().map((b) => (
            <li
              key={b.start}
              className="flex items-baseline justify-between py-1 text-xs tabular-nums"
            >
              <span className="text-muted-foreground">{b.start}</span>
              <span>
                {t("usageEmails", { count: b.count })}
                {b.cost !== null && ` ≈ $${b.cost.toFixed(3)}`}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
