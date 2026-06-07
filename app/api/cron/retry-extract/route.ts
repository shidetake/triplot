import { NextResponse } from "next/server";

import { retryDueErrors } from "@/lib/receipt/process";
import { createServiceClient } from "@/lib/supabase/service";

// 抽出失敗の自動リトライ（バックストップ）。主トリガは受信箱を開いた時の after() だが、
// 見に来ないユーザの分も回収するため Vercel Cron で定期実行する。期限（next_retry_at）
// の来たレート制限系の失敗だけを再抽出し、成功すれば下書き化する。

// 1 回の実行で再試行する最大件数（コスト/レート保護）。
const RETRY_BATCH = 25;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await retryDueErrors(createServiceClient(), { limit: RETRY_BATCH });
  return NextResponse.json({ ok: true });
}
