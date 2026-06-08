import { APICallError } from "ai";

import { extractReceipt, type TripHint } from "./extract";
import { EXTRACT_MODEL, MONTHLY_EMAIL_CAP } from "./importConfig";
import {
  type DraftCandidate,
  findMerge,
  selectMergeCandidates,
} from "./merge";
import { gatherReceiptText } from "./pipeline";
import type { Receipt } from "./schema";
import type { createServiceClient } from "@/lib/supabase/service";

// 受信メールの抽出・マージ・自動リトライ（バックグラウンド処理）。route handler から
// だけでなく、受信箱の after() と cron からも retryDueErrors を呼ぶため lib に置く。

// 後からマージで遡る未確定下書きの範囲（受信日）。
const MERGE_LOOKBACK_DAYS = 30;

type ServiceClient = ReturnType<typeof createServiceClient>;

// 月初（UTC）の ISO 文字列。
function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

// 抽出に渡す候補旅行（在籍中の旅行）。LLM が tripId を推論する材料。
async function fetchTripHints(
  supabase: ServiceClient,
  userId: string,
): Promise<TripHint[]> {
  const { data: memberships } = await supabase
    .from("trip_members")
    .select("trips(id, title, start_date, end_date)")
    .eq("user_id", userId)
    .is("left_at", null);
  return (memberships ?? [])
    .map((m) => m.trips)
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map((t) => ({
      id: t.id,
      title: t.title,
      startDate: t.start_date,
      endDate: t.end_date,
    }));
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
    .select("id, extracted, merged_extracted, body_text")
    .eq("user_id", userId)
    .eq("status", "extracted")
    .neq("id", emailId)
    .gte("received_at", since);

  const candidateIds = (others ?? []).map((o) => o.id);
  // 各候補に合体済みの子メールがあれば、その本文もマージ文脈に含める
  // （merged_into で辿る。referenceId では辿らない）。
  const childTextByParent = new Map<string, string[]>();
  if (candidateIds.length > 0) {
    const { data: children } = await supabase
      .from("inbound_emails")
      .select("merged_into, body_text")
      .eq("user_id", userId)
      .eq("status", "merged")
      .in("merged_into", candidateIds);
    for (const c of children ?? []) {
      if (!c.merged_into || !c.body_text) continue;
      const arr = childTextByParent.get(c.merged_into) ?? [];
      arr.push(c.body_text);
      childTextByParent.set(c.merged_into, arr);
    }
  }

  const drafts: DraftCandidate[] = (others ?? []).flatMap((o) => {
    // 突き合わせは実効値（合体済みなら合体後）で行う。
    const r = (o.merged_extracted ?? o.extracted) as unknown as Receipt | null;
    if (!r) return [];
    const texts = [o.body_text, ...(childTextByParent.get(o.id) ?? [])].filter(
      Boolean,
    );
    return [{ id: o.id, receipt: r, text: texts.join("\n\n---\n") }];
  });
  const candidates = selectMergeCandidates(receipt, drafts);
  if (candidates.length === 0) return null;
  return findMerge(EXTRACT_MODEL, { receipt, text }, candidates);
}

// 自動リトライ: レート制限など一時的な失敗のみ対象（パース不能等は恒久失敗で再試行
// しない）。次回時刻は 429 の Retry-After を優先し、無ければ exp backoff（1min から
// 倍々、6h 上限）。MAX_RETRIES 回で打ち切り。実発火は Cloudflare の毎分 cron。
const MAX_RETRIES = 6;
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 6 * 3_600_000;

function isRetryable(msg: string): boolean {
  return /rate.?limit|free tier|quota|too many requests|429|503|overloaded|timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(
    msg,
  );
}
function backoffMs(retryCount: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** retryCount, RETRY_MAX_MS);
}

// 429 が返す Retry-After（秒数 or HTTP-date）を尊重する。無ければ null。
function parseRetryAfterMs(err: unknown): number | null {
  if (!APICallError.isInstance(err)) return null;
  const ra = err.responseHeaders?.["retry-after"];
  if (!ra) return null;
  const secs = Number(ra);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(ra);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

// 次回リトライまでの待ち（Retry-After 優先、上限 RETRY_MAX_MS）。
function nextRetryMs(err: unknown, attempt: number): number {
  return Math.min(parseRetryAfterMs(err) ?? backoffMs(attempt), RETRY_MAX_MS);
}

// 抽出本体（LLM 呼び出し）→ マージ判定 → 下書き保存。LLM 失敗時は throw する
// （リトライ可否の判定は呼び出し側）。
async function runExtraction(
  supabase: ServiceClient,
  emailId: string,
  userId: string,
  raw: string,
): Promise<void> {
  // 本文＋PDFテキストを作り（これが痩せ版）、それを抽出に使う。候補旅行も渡して
  // 抽出と同時にどの旅行かを推論させる（追加トークンは旅行リスト分だけ）。
  const { subject, text } = await gatherReceiptText(raw);
  const trips = await fetchTripHints(supabase, userId);
  const { receipt, tripId } = await extractReceipt(EXTRACT_MODEL, {
    subject,
    text,
    trips,
  });
  const now = new Date().toISOString();

  // 後からマージ: 同じ取引の未確定下書きがあれば合体する。
  const merge = await tryMerge(supabase, userId, emailId, receipt, text);

  if (merge) {
    // ターゲットの「自分の」extracted は残し、合体結果は merged_extracted に。
    await supabase
      .from("inbound_emails")
      .update({ merged_extracted: merge.merged })
      .eq("id", merge.targetId);
    // 来たメールは merged として畳む。本文(body_text)は自分の行に残す。
    await supabase
      .from("inbound_emails")
      .update({
        status: "merged",
        merged_into: merge.targetId,
        extracted: receipt,
        extracted_at: now,
        body_text: text,
        raw: null,
        next_retry_at: null,
      })
      .eq("id", emailId);
  } else {
    // LLM が確信を持って旅行を割り当てたら自動割り当て（受信箱でのクリックを省く）。
    await supabase
      .from("inbound_emails")
      .update({
        status: "extracted",
        extracted: receipt,
        extracted_at: now,
        // 痩せ版を保持し、丸ごと MIME は捨てる（保持最小化）。
        body_text: text,
        raw: null,
        trip_id: tripId,
        next_retry_at: null,
      })
      .eq("id", emailId);
  }
}

// 初回の抽出試行（runExtraction を try/catch でくるむ）。失敗時はレート制限等の
// 一時的失敗だけ next_retry_at を立てて自動リトライ対象にし、恒久失敗は null で残す。
// 受信時の extractInBackground と over_quota の drain で共有する。
async function attemptExtraction(
  supabase: ServiceClient,
  emailId: string,
  userId: string,
  raw: string,
): Promise<void> {
  try {
    await runExtraction(supabase, emailId, userId, raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "extract failed";
    await supabase
      .from("inbound_emails")
      .update({
        status: "error",
        extract_error: msg,
        // 解禁時刻は Retry-After 優先（無ければ exp backoff）。
        next_retry_at: isRetryable(msg)
          ? new Date(Date.now() + nextRetryMs(e, 0)).toISOString()
          : null,
      })
      .eq("id", emailId);
  }
}

// 当月の抽出回数（コスト）。確定/合体後も extracted_at は残るので、確定でカウントが
// 減らない（status ではなく extracted_at で数える）。
async function monthlyExtractCount(
  supabase: ServiceClient,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("extracted_at", monthStartIso());
  return count ?? 0;
}

// 受信メールをバックグラウンドで抽出して下書きを保存する。月間上限を超えたら
// 抽出せず over_quota にする（コスト保護）。翌月に枠が空けば reprocessOverQuota が拾う。
export async function extractInBackground(
  supabase: ServiceClient,
  emailId: string,
  userId: string,
  raw: string,
): Promise<void> {
  if ((await monthlyExtractCount(supabase, userId)) >= MONTHLY_EMAIL_CAP) {
    await supabase
      .from("inbound_emails")
      .update({ status: "over_quota" })
      .eq("id", emailId);
    return;
  }
  await attemptExtraction(supabase, emailId, userId, raw);
}

// 期限の来たリトライ対象（status='error' かつ next_retry_at <= now）を再抽出する。
// Cloudflare の毎分 cron（retry-extract）から呼ぶ。成功すれば runExtraction が status を
// 進める。再び失敗したらバックオフを延ばし、上限/恒久失敗で打ち切る。
export async function retryDueErrors(
  supabase: ServiceClient,
  opts: { userId?: string; limit?: number } = {},
): Promise<void> {
  let q = supabase
    .from("inbound_emails")
    .select("id, user_id, raw, retry_count")
    .eq("status", "error")
    .not("next_retry_at", "is", null)
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(opts.limit ?? 10);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data: rows } = await q;

  for (const row of rows ?? []) {
    if (!row.raw || !row.user_id) continue;
    const attempt = (row.retry_count ?? 0) + 1;
    try {
      await runExtraction(supabase, row.id, row.user_id, row.raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "extract failed";
      const giveUp = attempt >= MAX_RETRIES || !isRetryable(msg);
      await supabase
        .from("inbound_emails")
        .update({
          retry_count: attempt,
          extract_error: msg,
          next_retry_at: giveUp
            ? null
            : new Date(Date.now() + nextRetryMs(e, attempt)).toISOString(),
        })
        .eq("id", row.id);
    }
  }
}

// 月間上限で保留された over_quota 行を、枠が空いた分だけ抽出する（翌月の自動再抽出）。
// 枠はユーザ単位で「CAP − 当月抽出数」。月替わりでカウントが 0 に戻ると drain される。
// retry と同じく Cloudflare の毎分 cron から呼ぶ＝「保留中の抽出を reconcile」する。
// 1 回の処理件数を絞り、少量ずつ消化してレート制限に優しくする。
export async function reprocessOverQuota(
  supabase: ServiceClient,
  opts: { limit?: number } = {},
): Promise<void> {
  const limit = opts.limit ?? 10;
  // 候補を多めに取り、ユーザごとの残り枠で絞る（古い順＝受信が早いものから）。
  const { data: rows } = await supabase
    .from("inbound_emails")
    .select("id, user_id, raw")
    .eq("status", "over_quota")
    .order("received_at", { ascending: true })
    .limit(limit * 4);
  if (!rows || rows.length === 0) return;

  const remainingByUser = new Map<string, number>();
  let processed = 0;
  for (const row of rows) {
    if (processed >= limit) break;
    if (!row.raw || !row.user_id) continue;
    let remaining = remainingByUser.get(row.user_id);
    if (remaining === undefined) {
      remaining = MONTHLY_EMAIL_CAP - (await monthlyExtractCount(supabase, row.user_id));
    }
    if (remaining <= 0) {
      remainingByUser.set(row.user_id, 0);
      continue;
    }
    await attemptExtraction(supabase, row.id, row.user_id, row.raw);
    remainingByUser.set(row.user_id, remaining - 1);
    processed++;
  }
}
