import { timingSafeEqual } from "node:crypto";

import { after, NextResponse } from "next/server";

import { extractReceipt } from "@/lib/receipt/extract";
import { EXTRACT_MODEL, MONTHLY_EMAIL_CAP } from "@/lib/receipt/importConfig";
import { parseImportToken } from "@/lib/receipt/inboundAddress";
import {
  type DraftCandidate,
  findMerge,
  selectMergeCandidates,
} from "@/lib/receipt/merge";
import { gatherReceiptText } from "@/lib/receipt/pipeline";
import type { Receipt } from "@/lib/receipt/schema";
import { createServiceClient } from "@/lib/supabase/service";

// 後からマージで遡る未確定下書きの範囲（受信日）。
const MERGE_LOOKBACK_DAYS = 30;

type ServiceClient = ReturnType<typeof createServiceClient>;

// 月初（UTC）の ISO 文字列。
function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

// 同じ取引の未確定下書きを探して合体結果を返す（無ければ null）。
async function tryMerge(
  supabase: ServiceClient,
  userId: string,
  emailId: string,
  receipt: Receipt,
  text: string,
): Promise<{ targetId: string; merged: Receipt } | null> {
  const since = new Date(
    Date.now() - MERGE_LOOKBACK_DAYS * 86_400_000,
  ).toISOString();
  const { data: others } = await supabase
    .from("inbound_emails")
    .select("id, extracted")
    .eq("user_id", userId)
    .eq("status", "extracted")
    .neq("id", emailId)
    .gte("received_at", since);

  const drafts: DraftCandidate[] = (others ?? []).flatMap((o) => {
    const r = o.extracted as unknown as Receipt | null;
    return r ? [{ id: o.id, receipt: r }] : [];
  });
  const candidates = selectMergeCandidates(receipt, drafts);
  if (candidates.length === 0) return null;
  return findMerge(EXTRACT_MODEL, { receipt, text }, candidates);
}

// 受信メールをバックグラウンドで抽出して下書きを保存する。月間上限を超えたら
// 抽出せず over_quota にする（コスト保護）。失敗は error として残す。
async function extractInBackground(
  supabase: ServiceClient,
  emailId: string,
  userId: string,
  raw: string,
): Promise<void> {
  const { count } = await supabase
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "extracted")
    .gte("received_at", monthStartIso());

  if ((count ?? 0) >= MONTHLY_EMAIL_CAP) {
    await supabase
      .from("inbound_emails")
      .update({ status: "over_quota" })
      .eq("id", emailId);
    return;
  }

  try {
    // 本文＋PDFテキストを作り（これが痩せ版）、それを抽出に使う。
    const { subject, text } = await gatherReceiptText(raw);
    const receipt = await extractReceipt(EXTRACT_MODEL, { subject, text });
    const now = new Date().toISOString();

    // 後からマージ: 同じ取引の未確定下書きがあれば合体する。
    const merge = await tryMerge(supabase, userId, emailId, receipt, text);

    if (merge) {
      // ターゲットに合体結果を反映（本文も蓄積）。
      const { data: target } = await supabase
        .from("inbound_emails")
        .select("body_text")
        .eq("id", merge.targetId)
        .single();
      await supabase
        .from("inbound_emails")
        .update({
          extracted: merge.merged,
          body_text: [target?.body_text, text].filter(Boolean).join("\n\n---\n"),
        })
        .eq("id", merge.targetId);
      // 来たメールは merged として畳む（痩せる）。
      await supabase
        .from("inbound_emails")
        .update({
          status: "merged",
          merged_into: merge.targetId,
          extracted: receipt,
          extracted_at: now,
          body_text: null,
          raw: null,
        })
        .eq("id", emailId);
    } else {
      await supabase
        .from("inbound_emails")
        .update({
          status: "extracted",
          extracted: receipt,
          extracted_at: now,
          // 痩せ版を保持し、丸ごと MIME は捨てる（保持最小化）。
          body_text: text,
          raw: null,
        })
        .eq("id", emailId);
    }
  } catch (e) {
    await supabase
      .from("inbound_emails")
      .update({
        status: "error",
        extract_error: e instanceof Error ? e.message : "extract failed",
      })
      .eq("id", emailId);
  }
}

// Cloudflare Email Worker からの受信メール通知を受ける webhook。
// M2: 生メール(MIME)を inbound_emails テーブルにそのまま保存する（サンプル蓄積）。
// パースはまだしない。Worker とは共有シークレット（X-Inbound-Secret ヘッダ）で
// 認証し、第三者が偽の受信を投げ込めないようにする。

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual は長さが違うと例外なので先に長さで弾く。
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.INBOUND_EMAIL_SECRET;
  if (!expected) {
    // 設定漏れ。シークレット未設定のまま誰でも投げられる状態にはしない。
    return NextResponse.json(
      { error: "inbound email not configured" },
      { status: 500 },
    );
  }

  if (!secretMatches(request.headers.get("x-inbound-secret"), expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const from = typeof body.from === "string" ? body.from : null;
  const to = typeof body.to === "string" ? body.to : null;
  const raw = typeof body.raw === "string" ? body.raw : null;
  if (!from || !to || !raw) {
    return NextResponse.json(
      { error: "missing from / to / raw" },
      { status: 400 },
    );
  }

  const subject = typeof body.subject === "string" ? body.subject : null;
  const messageId =
    typeof body.messageId === "string" ? body.messageId : null;
  const size = typeof body.rawSize === "number" ? body.rawSize : raw.length;

  const supabase = createServiceClient();

  // 宛先トークンから本人を特定（From に依存しない）。不明なら user_id = null。
  let userId: string | null = null;
  const token = parseImportToken(to);
  if (token) {
    const { data: u } = await supabase
      .from("users")
      .select("id")
      .eq("import_token", token)
      .maybeSingle();
    userId = u?.id ?? null;
  }

  const { data: inserted, error } = await supabase
    .from("inbound_emails")
    .insert({
      sender: from,
      recipient: to,
      subject,
      message_id: messageId,
      raw,
      size,
      user_id: userId,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[inbound-email] insert failed", error?.message);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  console.log(
    "[inbound-email] stored",
    JSON.stringify({ from, to, subject, size, user: Boolean(userId) }),
  );

  // 本人が特定できたものはレスポンス後にバックグラウンド抽出（Worker は即 200）。
  if (userId) {
    const emailId = inserted.id;
    const uid = userId;
    after(() => extractInBackground(supabase, emailId, uid, raw));
  }

  return NextResponse.json({ ok: true });
}
