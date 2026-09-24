import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";

// 登録ユーザー数・アクティブユーザー数の推移用の日次スナップショット
// （Vercel Cron で毎日1回）。expire-inbound と同じ形。
//
// 1日1行を upsert するだけなので、何度叩いても壊れない（同日の再実行は
// 上書きになるだけ）。実際の集計は record_daily_user_stats（SECURITY DEFINER、
// service_role 専用）が持つ——**登録/アクティブ数の定義は management/page.tsx が
// 呼ぶ admin_active_user_count と同じ関数（compute_active_user_count）を
// 共有している**ので、ここと管理画面の表示がずれることはない。
//
// 1日の終わり（UTC 23:50）に叩くのは、DB の current_date（UTC 基準）が
// その日の間に取れる値として最も「その日を見た」に近いため
// （早朝に叩くとその日の登録・サインインをほぼ含まないまま記録してしまう）。

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error } = await createServiceClient().rpc("record_daily_user_stats");

  if (error) {
    console.error("[user-stats-daily]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
