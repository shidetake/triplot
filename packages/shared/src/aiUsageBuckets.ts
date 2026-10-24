// 管理画面の「LLM 使用量の推移」。日別・週別・月別に、抽出した通数と費用を並べる。
//
// 費用は**実際にかかった額**（ai_calls に LLM を呼ぶたびに記録した額の合計）。
// 記録を始める前の日は額が分からないので null にする（通数は ai_usage_daily に
// 前からある）。

export type UsageGranularity = "day" | "week" | "month";

export type UsageBucket = {
  /** バケットの開始日（YYYY-MM-DD、ローカル日付）。表示のキーにもする。 */
  start: string;
  count: number;
  /** 概算コスト（USD）。単価が出せないときは null。 */
  cost: number | null;
};

// その日が属するバケットの開始日。週は月曜始まり（ISO 8601）。
export function bucketStart(date: Date, g: UsageGranularity): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (g === "week") {
    // getDay(): 0=日曜。月曜を週初にするので、日曜だけ6日戻す。
    const back = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - back);
  } else if (g === "month") {
    d.setDate(1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 直近 n バケットぶんの区切り（新しい順ではなく**古い順**で返す。グラフも表も
// 左から右へ時間が流れる向きに揃える）。
export function recentBucketStarts(
  now: Date,
  g: UsageGranularity,
  n: number,
): string[] {
  const starts: string[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < n; i++) {
    starts.push(bucketStart(cursor, g));
    if (g === "day") cursor.setDate(cursor.getDate() - 1);
    else if (g === "week") cursor.setDate(cursor.getDate() - 7);
    else cursor.setMonth(cursor.getMonth() - 1);
  }
  return starts.reverse();
}

/** 日別の抽出通数（ai_usage_daily の1行ぶん）。day は "YYYY-MM-DD"。 */
export type DailyCount = { day: string; count: number };

/** 日別の費用（ai_calls の日別合計の1行ぶん）。day は "YYYY-MM-DD"。 */
export type DailyCost = { day: string; cost: number };

// "YYYY-MM-DD" をローカル日付として読む（new Date("...") は UTC 扱いに
// なり、日本時間では前日にずれる）。
function localDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 日別の抽出通数と費用 → バケットごとの通数と費用。
 *
 * 入力が**日別の集計済みの数**なのは、元の抽出行（inbound_emails）が消えても
 * 履歴を残すため（ai_usage_daily。90日の自動削除やテスト用の受信箱クリアで
 * 履歴ごと消えていた）。
 *
 * 抽出が1件も無いバケットも 0 で埋める（歯抜けだと「その日は使わなかった」と
 * 「データが無い」の区別が付かない）。費用も同じで、記録を始めた後の日は
 * 記録が無ければ 0、**記録を始める前の日を含むバケットは null**（0 と
 * 「分からない」は別。0 だと「使っていない」に見える）。
 */
export function buildUsageBuckets(
  daily: DailyCount[],
  costs: DailyCost[],
  opts: {
    now: Date;
    granularity: UsageGranularity;
    bucketCount: number;
    /** 費用の記録を始めた日（"YYYY-MM-DD"）。これより前の費用は分からない。 */
    costSince: string;
  },
): UsageBucket[] {
  const counts = new Map<string, number>();
  for (const { day, count } of daily) {
    const key = bucketStart(localDay(day), opts.granularity);
    counts.set(key, (counts.get(key) ?? 0) + count);
  }
  const sums = new Map<string, number>();
  for (const { day, cost } of costs) {
    const key = bucketStart(localDay(day), opts.granularity);
    sums.set(key, (sums.get(key) ?? 0) + cost);
  }
  return recentBucketStarts(opts.now, opts.granularity, opts.bucketCount).map(
    (start) => ({
      start,
      count: counts.get(start) ?? 0,
      // "YYYY-MM-DD" 同士は文字列の大小がそのまま日付の前後になる。
      cost: start < opts.costSince ? null : (sums.get(start) ?? 0),
    }),
  );
}
