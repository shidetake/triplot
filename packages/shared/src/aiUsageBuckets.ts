// 管理画面の「LLM 使用量の推移」。日別・週別・月別に、抽出した通数と概算コスト
// を並べる。
//
// **AI Gateway は累計額しか返さない**（残高と total_used のみ。日別の内訳を
// 取る API が無い）。なので推移は「その期間に抽出した通数 × 1通あたりの実績
// 単価」で出す。単価は累計額 ÷ 累計通数なので**全期間の平均**で、日ごとの
// 実際のばらつき（本文の長いメールが集中した日は高い等）は反映されない。
// 概算だと分かる形で見せること。

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

/**
 * 日別の抽出通数 → バケットごとの通数とコスト。
 *
 * 入力が**日別の集計済みの数**なのは、元の抽出行（inbound_emails）が消えても
 * 履歴を残すため（ai_usage_daily。90日の自動削除やテスト用の受信箱クリアで
 * 履歴ごと消えていた）。
 *
 * 抽出が1件も無いバケットも 0 で埋める（歯抜けだと「その日は使わなかった」と
 * 「データが無い」の区別が付かない）。
 */
export function buildUsageBuckets(
  daily: DailyCount[],
  opts: {
    now: Date;
    granularity: UsageGranularity;
    bucketCount: number;
    /** 1通あたりの実績単価（USD）。出せないときは null。 */
    perEmailUsd: number | null;
  },
): UsageBucket[] {
  const counts = new Map<string, number>();
  for (const { day, count } of daily) {
    // "YYYY-MM-DD" をローカル日付として読む（new Date("...") は UTC 扱いに
    // なり、日本時間では前日にずれる）。
    const [y, m, d] = day.split("-").map(Number);
    const key = bucketStart(new Date(y, m - 1, d), opts.granularity);
    counts.set(key, (counts.get(key) ?? 0) + count);
  }
  return recentBucketStarts(opts.now, opts.granularity, opts.bucketCount).map(
    (start) => {
      const count = counts.get(start) ?? 0;
      return {
        start,
        count,
        cost: opts.perEmailUsd === null ? null : count * opts.perEmailUsd,
      };
    },
  );
}
