import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";

// 受信メールの保持ポリシーの掃除ジョブ（Vercel Cron で毎日実行）。
// 90日経っても未確定/未破棄のまま放置された下書き・抽出失敗・合体済みの行を
// 削除する（無期限の個人データ保持を避ける）。確定/破棄済みは provenance として
// 残す（既に raw・body_text は消えている）。

const EXPIRE_DAYS = 90;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(
    Date.now() - EXPIRE_DAYS * 86_400_000,
  ).toISOString();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("inbound_emails")
    .delete()
    .lt("received_at", cutoff)
    .not("status", "in", "(confirmed,dismissed)")
    .select("id");

  if (error) {
    console.error("[expire-inbound]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deleted = data?.length ?? 0;
  console.log(`[expire-inbound] deleted ${deleted} (older than ${EXPIRE_DAYS}d)`);
  return NextResponse.json({ deleted });
}
