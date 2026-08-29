import { NextResponse } from "next/server";

import { acquireDrainLease, releaseDrainLease } from "@/lib/import/drainLease";
import { fetchGatewayCredits } from "@/lib/import/gatewayCredits";
import {
  DRAIN_BUDGET_MS,
  reprocessOverQuota,
  retryDueErrors,
} from "@/lib/import/process";
import { createServiceClient } from "@/lib/supabase/service";

// 保留中の抽出を reconcile するエンドポイント。Cloudflare の毎分 cron（心拍 Worker）が
// 叩く。状態は DB が持ち、ここは「期限の来た error の再試行」と「枠の空いた over_quota
// の再抽出」を消化する。**件数では区切らず、時間の予算まで進める**（流量を決めるのは
// レート制限そのもの）。

// 関数の寿命。時間の予算（DRAIN_BUDGET_MS）は、走り出した1件ぶんの余裕を引いて
// これより内側に取ってある（内訳は DRAIN_BUDGET_MS のコメント）。
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 前の実行がまだ走っていたら、この回は何もしない。重なると同じ行を2回抽出
  // してしまう（下書きが二重にでき、LLM の料金も月間の枠も二重に減る）。
  if (!(await acquireDrainLease(supabase))) {
    return NextResponse.json({ ok: true, skipped: "in progress" });
  }

  let retry;
  try {
    // **1回で何件処理するかは決めない。進める限り進む。** 流量を決めるのは
    // レート制限（429 で打ち切り、次の毎分 cron が再挑戦）で、こちらが件数を
    // 見積もる必要はない。決め打ちの件数は、速い時は無駄に足踏みし、遅い時は
    // 関数の寿命を超えるだけで、どちらの側にも正しい値が無い。
    // 2つの drain で1つの締切を共有する（合計がこの時間を超えない）。
    const deadline = Date.now() + DRAIN_BUDGET_MS;
    retry = await retryDueErrors(supabase, { deadline });
    await reprocessOverQuota(supabase, { deadline });
  } finally {
    await releaseDrainLease(supabase);
  }

  // 失敗した回だけ残高を引いて記録する（毎回は引かない）。狙いは診断で、
  // 「レート制限に張り付いている」のか「クレジットが尽きた」のかを後から
  // 切り分けられるようにするため。エラーの文面だけでは区別が付かない。
  // 枯渇時に実際どんなエラーが返るかを観測したら、専用の扱いを足す。
  let credits = null;
  if (retry.rateLimited || retry.failed > 0) {
    credits = await fetchGatewayCredits();
    console.warn(
      `[retry-extract] attempted=${retry.attempted} succeeded=${retry.succeeded} ` +
        `rateLimited=${retry.rateLimited} failed=${retry.failed} ` +
        `balance=${credits ? credits.balance.toFixed(4) : "unknown"}`,
    );
  }

  return NextResponse.json({
    ok: true,
    retry,
    balance: credits?.balance ?? null,
  });
}
