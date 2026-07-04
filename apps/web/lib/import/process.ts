import { APICallError } from "ai";

import { extractEmail, type TripHint } from "./extract";
import { fetchReceiptLink } from "./fetchLink";
import { EXTRACT_MODEL, MONTHLY_EMAIL_CAP } from "./importConfig";
import { isAllowedReceiptHost, isUnknownReceiptHostUrl } from "./links";
import {
  type DraftCandidate,
  findMerge,
  selectMergeCandidates,
} from "./merge";
import { appendLinkText, gatherReceiptText } from "./pipeline";
import type { EventDraft, Extraction, Receipt } from "./schema";
import type { createServiceClient } from "@/lib/supabase/service";

// 受信メールの抽出・マージ・自動リトライ（バックグラウンド処理）。route handler から
// だけでなく、受信箱の after() と cron からも retryDueErrors を呼ぶため lib に置く。

// 後からマージで遡る未確定下書きの範囲（受信日）。
const MERGE_LOOKBACK_DAYS = 30;

// 抽出は成功したが費用も予定も見つからなかったメールの恒久エラー（UI が翻訳して表示）。
export const EXTRACT_ERROR_NO_CONTENT = "no_content";

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

// jsonb は DB 側でキー順を正規化するので、payload の同値比較はキーをソートした
// JSON 文字列で行う（JS オブジェクトのキー順に依存しない）。
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, val]) => `${JSON.stringify(k)}:${stableStringify(val)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(v);
}

// 未確定 draft 行（作業状態）から実効値を組み立てる。
function extractionFromDrafts(
  rows: { kind: string; payload: unknown }[],
): Extraction {
  const receipt = rows.find((r) => r.kind === "expense")?.payload as
    | Receipt
    | undefined;
  return {
    receipt: receipt ?? null,
    events: rows
      .filter((r) => r.kind === "event")
      .map((r) => r.payload as EventDraft),
  };
}

// メールの pending draft 行を extraction の内容で置き換える（confirmed/dismissed は
// 触らない）。再抽出・マージで確定済みの項目を重複させないよう、確定済みの費用が
// あれば費用 draft は作らず、確定済みと同内容の予定はスキップする。
async function replacePendingDrafts(
  supabase: ServiceClient,
  emailId: string,
  x: Extraction,
): Promise<void> {
  const { data: confirmed } = await supabase
    .from("inbound_drafts")
    .select("kind, payload")
    .eq("email_id", emailId)
    .eq("status", "confirmed");
  await supabase
    .from("inbound_drafts")
    .delete()
    .eq("email_id", emailId)
    .eq("status", "pending");
  const hasConfirmedExpense = (confirmed ?? []).some(
    (d) => d.kind === "expense",
  );
  const confirmedEventJson = new Set(
    (confirmed ?? [])
      .filter((d) => d.kind === "event")
      .map((d) => stableStringify(d.payload)),
  );
  const rows: { email_id: string; kind: string; payload: Receipt | EventDraft }[] =
    [];
  if (x.receipt && !hasConfirmedExpense) {
    rows.push({ email_id: emailId, kind: "expense", payload: x.receipt });
  }
  for (const ev of x.events) {
    if (confirmedEventJson.has(stableStringify(ev))) continue;
    rows.push({ email_id: emailId, kind: "event", payload: ev });
  }
  if (rows.length > 0) await supabase.from("inbound_drafts").insert(rows);
}

// 同じ取引・予約の未確定下書きを探して合体結果を返す（無ければ null）。
async function tryMerge(
  supabase: ServiceClient,
  userId: string,
  emailId: string,
  extraction: Extraction,
  text: string,
): Promise<{ targetId: string; merged: Extraction } | null> {
  const since = new Date(
    Date.now() - MERGE_LOOKBACK_DAYS * 86_400_000,
  ).toISOString();
  const { data: others } = await supabase
    .from("inbound_emails")
    .select("id, body_text")
    .eq("user_id", userId)
    .eq("status", "extracted")
    .neq("id", emailId)
    .gte("received_at", since);

  const candidateIds = (others ?? []).map((o) => o.id);
  if (candidateIds.length === 0) return null;

  // 突き合わせは実効値＝未確定 draft 行（作業状態）で行う。未確定が無いメールは
  // 合体先にならない（確定済みには触らないため）。
  const { data: draftRows } = await supabase
    .from("inbound_drafts")
    .select("email_id, kind, payload")
    .eq("status", "pending")
    .in("email_id", candidateIds);
  const draftsByEmail = new Map<string, { kind: string; payload: unknown }[]>();
  for (const d of draftRows ?? []) {
    const arr = draftsByEmail.get(d.email_id) ?? [];
    arr.push(d);
    draftsByEmail.set(d.email_id, arr);
  }

  // 各候補に合体済みの子メールがあれば、その本文もマージ文脈に含める
  // （merged_into で辿る。referenceId では辿らない）。
  const childTextByParent = new Map<string, string[]>();
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

  const drafts: DraftCandidate[] = (others ?? []).flatMap((o) => {
    const rows = draftsByEmail.get(o.id) ?? [];
    if (rows.length === 0) return [];
    const texts = [o.body_text, ...(childTextByParent.get(o.id) ?? [])].filter(
      Boolean,
    );
    return [
      {
        id: o.id,
        extraction: extractionFromDrafts(rows),
        text: texts.join("\n\n---\n"),
      },
    ];
  });
  const candidates = selectMergeCandidates(extraction, drafts);
  if (candidates.length === 0) return null;
  return findMerge(EXTRACT_MODEL, { extraction, text }, candidates);
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

// LLM が見つけた明細リンク(detailUrl)のうち、まだ許可リストに無いホストを学習用に
// 記録する。残すのはホスト名と path だけ（クエリ/トークンは捨てる）。人が admin 管理
// ページ（/admin）で出現回数を見て本物のレシート基盤を RECEIPT_LINK_HOSTS に昇格させる。
async function recordCandidateLink(
  supabase: ServiceClient,
  detailUrl: string | null,
): Promise<void> {
  if (!detailUrl) return;
  let u: URL;
  try {
    u = new URL(detailUrl);
  } catch {
    return;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return;
  if (isAllowedReceiptHost(u.hostname)) return; // 既に許可済みは enrich 済みなので不要
  await supabase.rpc("record_receipt_link_candidate", {
    p_host: u.hostname,
    p_sample_url: `${u.protocol}//${u.host}${u.pathname}`,
  });
}

// 抽出本体（LLM 呼び出し）→ マージ判定 → 下書き保存。LLM 失敗時は throw する
// （リトライ可否の判定は呼び出し側）。
async function runExtraction(
  supabase: ServiceClient,
  emailId: string,
  userId: string,
  raw: string,
): Promise<void> {
  // 本文＋PDFテキストを作り（これが痩せ版）、許可ホストの明細リンクは fetch して本文に
  // 付加（enrichment）。候補旅行も渡して、抽出と同時にどの旅行か＋明細リンクを推論させる。
  const { subject, text: gatheredText } = await gatherReceiptText(raw, {
    fetchLink: fetchReceiptLink,
  });
  const trips = await fetchTripHints(supabase, userId);
  let text = gatheredText;
  let extractResult = await extractEmail(EXTRACT_MODEL, {
    subject,
    text,
    trips,
  });
  // LLM が見つけた明細リンクのうち、未許可ホストを学習用に記録（ホスト名のみ）。
  // 昇格されれば第1パスで取得でき、下の第2パス（追加 LLM 呼び出し）が不要になる。
  await recordCandidateLink(supabase, extractResult.detailUrl);

  // 第2パス: 明細が未許可ホストのリンク先にしか無いメール。LLM が特定したその URL
  // 1本だけを SSRF ガード付きで取得して本文に足し、もう1回だけ抽出し直す（第2パスの
  // detailUrl はさらに fetch しない＝ループ禁止）。取得失敗・LLM 失敗はどちらも
  // 第1パス結果で続行する（enrichment は best-effort）。
  if (
    extractResult.detailUrl &&
    isUnknownReceiptHostUrl(extractResult.detailUrl)
  ) {
    const linkText = await fetchReceiptLink(extractResult.detailUrl, {
      requireAllowedHost: false,
    });
    if (linkText && linkText.trim()) {
      const enriched = appendLinkText(text, extractResult.detailUrl, linkText);
      try {
        extractResult = await extractEmail(EXTRACT_MODEL, {
          subject,
          text: enriched,
          trips,
        });
        text = enriched; // 痩せ版(body_text)にもリンク先明細を残す（マージ判定の文脈）
      } catch {
        // 第1パス結果にフォールバック
      }
    }
  }
  const { receipt, events, tripId } = extractResult;
  const now = new Date().toISOString();
  const extraction: Extraction = { receipt, events };

  // 費用も予定も見つからなかったメールは恒久エラー（リトライ対象外、受信箱に表示）。
  // LLM は呼んだので extracted_at を立ててコストに数える。本文は用済みなので消す。
  if (!receipt && events.length === 0) {
    await supabase
      .from("inbound_emails")
      .update({
        status: "error",
        extract_error: EXTRACT_ERROR_NO_CONTENT,
        extracted_at: now,
        body_text: null,
        raw: null,
        next_retry_at: null,
      })
      .eq("id", emailId);
    return;
  }

  // 後からマージ: 同じ取引・予約の未確定下書きがあれば合体する。
  const merge = await tryMerge(supabase, userId, emailId, extraction, text);

  if (merge) {
    // ターゲットの「自分の」extracted は残し、作業状態（pending draft 行）を合体結果で
    // 置き換える（確定済みは触らない）。
    await replacePendingDrafts(supabase, merge.targetId, merge.merged);
    // 来たメールは merged として畳む（draft 行は作らない）。本文(body_text)は自分の行に残す。
    await supabase
      .from("inbound_emails")
      .update({
        status: "merged",
        merged_into: merge.targetId,
        extracted: extraction,
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
        extracted: extraction,
        extracted_at: now,
        // 痩せ版を保持し、丸ごと MIME は捨てる（保持最小化）。
        body_text: text,
        raw: null,
        trip_id: tripId,
        next_retry_at: null,
      })
      .eq("id", emailId);
    // 作業状態（draft 行）を抽出結果で作る（エラーからの再抽出では作り直し）。
    await replacePendingDrafts(supabase, emailId, extraction);
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
