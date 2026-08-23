import { NextResponse } from "next/server";

import { fetchGatewayCredits } from "@/lib/import/gatewayCredits";
import { reprocessOverQuota, retryDueErrors } from "@/lib/import/process";
import { createServiceClient } from "@/lib/supabase/service";

// 保留中の抽出を reconcile するエンドポイント。Cloudflare の毎分 cron（心拍 Worker）が
// 叩く。状態は DB が持ち、ここは「期限の来た error の再試行」と「枠の空いた over_quota
// の再抽出」を少量ずつ消化する（レート制限に優しく、月替わりも数分以内に drain）。

// 1 回の実行で処理する最大件数（コスト/レート保護）。
const RETRY_BATCH = 25;
const OVER_QUOTA_BATCH = 10;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const retry = await retryDueErrors(supabase, { limit: RETRY_BATCH });
  await reprocessOverQuota(supabase, { limit: OVER_QUOTA_BATCH });

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
