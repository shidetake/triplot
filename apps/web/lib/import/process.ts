import { APICallError } from "ai";

import { extractEmail, type TripHint } from "./extract";
import { acquireExtractLease, releaseExtractLease } from "./drainLease";
import { fetchReceiptLink } from "./fetchLink";
import { receiptPlaceName } from "@triplot/shared/import/merchantName";
import {
  EXTRACT_MODEL,
  FUNCTION_MAX_SECONDS,
  MONTHLY_EMAIL_CAP,
} from "./importConfig";
import { effectiveEmailCap } from "@triplot/shared/import/emailCap";
import { createFlightApi } from "@triplot/shared/data/flightApi";
import {
  resolveFlightNumber,
  type FlightEndpoint,
} from "@triplot/shared/flight";
import { lookupFlight } from "@triplot/shared/flightLookup";
import { EXTRACT_ERROR_NO_CONTENT } from "@triplot/shared/import/config";
import {
  receiptDate,
  type StoredEventDraft,
  type StoredReceipt,
} from "@triplot/shared/import/drafts";
import { fetchFxRates } from "@triplot/shared/fxRates";
import { dominantCenter } from "@triplot/shared/placeMap";
import { timezoneOfPlace } from "@triplot/shared/placeTimezone";
import { fetchUnassignedDrafts } from "@triplot/shared/data/reads/inbox";
import { unassignedBiasCenter } from "@triplot/shared/tripBias";
import {
  resolveAirportPlace,
  resolveNamedPlace,
  type PlaceCandidate,
} from "@triplot/shared/placesSearch";
import {
  isAllowedReceiptHost,
  isLikelyUnsubscribeUrl,
  isUnknownReceiptHostUrl,
} from "./links";
import { type DraftCandidate, findMerge, selectMergeCandidates } from "./merge";
import { appendLinkText, gatherReceiptText } from "./pipeline";
import {
  extractionGainedDetail,
  extractionLostDetail,
  type EventDraft,
  type Extraction,
  type Receipt,
} from "@triplot/shared/import/schema";
import type { createServiceClient } from "@/lib/supabase/service";

// 受信メールの抽出・マージ・自動リトライ（バックグラウンド処理）。route handler から
// だけでなく、受信箱の after() と cron からも retryDueErrors を呼ぶため lib に置く。

// 後からマージで遡る未確定下書きの範囲（受信日）。
const MERGE_LOOKBACK_DAYS = 30;

// 抽出は成功したが費用も予定も見つからなかったメールの恒久エラー（UI が翻訳して表示）。
// 値は shared（RN の受信箱も表示分岐に使う）。既存 import を壊さないよう re-export。
export { EXTRACT_ERROR_NO_CONTENT };

type ServiceClient = ReturnType<typeof createServiceClient>;

// バイアスを借りる材料。中身の判定は shared 側（unassignedBiasCenter）が持つ。
type BiasDraft = { kind: string; payload: unknown };

// 月初（UTC）の ISO 文字列。
function monthStartIso(): string {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
  ).toISOString();
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
    Receipt | undefined;
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
  const rows: {
    email_id: string;
    kind: string;
    payload: Receipt | EventDraft;
  }[] = [];
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

// 自動リトライ。失敗を**性質で分けて**扱う（詳細は docs/design/import-flow.md）。
//
//   rate_limit  429。時間で解ける。バックオフしない＝毎分の cron で同条件で再挑戦し、
//               通る分だけ通す（制限そのものが調速機になる）。行の落ち度ではないので
//               retry_count を増やさない。
//   transient   5xx・ネットワーク。相手が弱っているので指数バックオフで優しくする。
//               打ち切らない（障害が2時間続いたらレシートを失う、では困る）。
//   permanent   パース不能・費用も予定も無い等。その行固有なので即打ち切り。
//   unknown     分類できないもの。一時的として扱うが MAX_RETRIES で蓋をする
//               （永続的な失敗を「再試行します」と 90 日間言い続けないため）。
//
// 打ち切らない経路の最終的な回収は expire-inbound（90 日で削除）が担う。
export type FailureKind = "rate_limit" | "transient" | "permanent" | "unknown";

const MAX_RETRIES = 6;
// 1 件の抽出に見込む最悪の時間。実測 15〜30 秒（LLM 2 パス＋リンク取得＋場所解決）。
// 多めに取る — 足りないと下の引き算が破れて、関数ごと殺される側に倒れる。
const WORST_ITEM_MS = 60_000;

// 1 回の cron 実行で**新しい1件を始めてよい時間**。件数ではなくここで区切る。
//
// 締切は「始める前」に見るので、走り出した1件は締切を越えて走り続ける。だから
// 予算は関数の寿命そのものではなく、**1件ぶんの余裕を引いた値**にする。ここを
// 寿命いっぱいに取ると、締切ぎりぎりで始めた1件が**抽出の途中で関数ごと殺される**
// （LLM の料金だけ払って結果が入らない）。
//
// 「上限を持たせずに無限に回す」は選べない。サーバーレス関数の実行時間の上限は
// プラットフォームが持っていて、超えれば途中で殺される。選べるのは「自分から
// 降りる」か「殺される」かの2つだけで、残りは次の毎分 cron が拾う（1回でやり切る
// 必要がそもそも無い）。
//
// 以前の「1回25件まで」は 25 × 15s = 375s で寿命を大きく超えるので、実質の上限は
// 件数ではなく「関数が殺される」だった。レート制限で1回2件しか通っていなかった
// ので表に出ていなかっただけ。
export const DRAIN_BUDGET_MS =
  FUNCTION_MAX_SECONDS * 1000 - WORST_ITEM_MS - 10_000;
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 6 * 3_600_000;

// ステータスコードで判定する。メッセージの正規表現だと、レート制限とクレジット枯渇が
// どちらも "free tier" / "quota" を含むため区別できない（実際に区別できていなかった）。
// APICallError が取れないケースだけ文字列に落ちる。
export function classifyFailure(err: unknown): FailureKind {
  const status = APICallError.isInstance(err) ? err.statusCode : undefined;
  if (status === 429) return "rate_limit";
  if (status !== undefined) {
    if (status >= 500) return "transient";
    if (status === 408) return "transient";
    return "permanent";
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/rate.?limit|too many requests|\b429\b/i.test(msg)) return "rate_limit";
  if (
    /\b5\d\d\b|overloaded|timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(msg)
  )
    return "transient";
  return "unknown";
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

// LLM が見つけた明細リンク(detailUrl)のうち、まだ許可リストに無いホストを学習用に
// 記録する。残すのはホスト名と path だけ（クエリ/トークンは捨てる）。人が admin 管理
// ページ（/admin）で出現回数を見て本物のレシート基盤を RECEIPT_LINK_HOSTS に昇格させる。
async function recordCandidateLink(
  supabase: ServiceClient,
  detailUrl: string | null,
  opts: { skippedUnsubscribe?: boolean } = {},
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
    p_skipped_unsubscribe: opts.skippedUnsubscribe ?? false,
  });
}

// 出発/到着の空港を Google の場所に解決する（見つかった時だけ両方
// 並行で引く）。GOOGLE_PLACES_SERVER_API_KEY が未設定なら何もしない
// （座標つき自由入力のまま — 機能の前提ではなく表示上の改善のため）。
// このキーはブラウザ/アプリ用キーと違い application 制限を付けない
// サーバー専用の秘密（Places API (New) だけに API 制限）。
async function resolveFlightPlaces(flight: {
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
}): Promise<{
  departure: PlaceCandidate | null;
  arrival: PlaceCandidate | null;
}> {
  const apiKey = process.env.GOOGLE_PLACES_SERVER_API_KEY;
  if (!apiKey) return { departure: null, arrival: null };
  const [departure, arrival] = await Promise.all([
    resolveAirportPlace(flight.departure, { apiKey }),
    resolveAirportPlace(flight.arrival, { apiKey }),
  ]);
  return { departure, arrival };
}

// この旅行の既存ピンの重心（地理バイアス用）。tripId が未割当/ピンが無ければ
// null（呼び出し側は場所名の Google 解決自体をスキップする — バイアス無しで
// 店名検索すると無関係な同名店に化ける恐れが大きいため）。
async function fetchTripBiasCenter(
  supabase: ServiceClient,
  tripId: string,
): Promise<{ lat: number; lng: number } | null> {
  const { data } = await supabase
    .from("places")
    .select("lat, lng")
    .eq("trip_id", tripId)
    .not("lat", "is", null)
    .not("lng", "is", null);
  const points = (data ?? [])
    .filter(
      (p): p is { lat: number; lng: number } => p.lat != null && p.lng != null,
    )
    .map((p) => ({ lat: p.lat, lng: p.lng }));
  return dominantCenter(points);
}

// dominantCenter（旅行全体のピンの重心）は、東京↔ホノルルのような長距離
// フライトを挟む旅行だと「今どちらの拠点にいるか」を無視して逆側に引っ張ら
// れることがある（実機フィードバック: ホノルルのレストランの検索がなぜか
// 成田を中心に行われて見つからなかった。東京側・ホノルル側の空港ピンが
// それぞれ単独クラスタで、全体の重心/優勢クラスタ選定がどちらに転ぶかは
// 点の並びに依存し、対象日と無関係に決まってしまう）。対象日付以前に到着
// した直近の移動（transit）があれば、その到着地（＝対象日にいるはずの場所）
// を優先してバイアスにする。無ければ dominantCenter にフォールバックする。
// 旅行が決まっていない時だけ、同じ受信箱の未割り当ての下書きを取ってくる
// （バイアスの材料。unassignedBiasCenter 参照）。**1通の抽出につき1回だけ引く** —
// 場所の解決は費用と予定それぞれで走るので、その都度引くと同じクエリを何度も
// 投げることになる。
async function fetchBiasDrafts(
  supabase: ServiceClient,
  userId: string,
  tripId: string | null,
): Promise<BiasDraft[] | null> {
  if (tripId) return null;
  return await fetchUnassignedDrafts(supabase, userId);
}

async function fetchBiasCenterForDate(
  supabase: ServiceClient,
  tripId: string | null,
  targetDate: string | null,
  // 旅行が決まっていない時の材料＝**同じ受信箱の未割り当ての下書き**。
  // 日付の近い未割り当ての下書きは同じ旅行のものである可能性が高いので、
  // そこから「その日どこにいたか」を借りる（unassignedBiasCenter）。
  // これが無いと、旅行に割り当てられる前に取り込まれたメールは店名を一切
  // 解決できない（実データで、旅行未確定のまま取り込んだ Howzit / ALOHA SMASH
  // が文字列のまま残っていた）。
  fallback?: { drafts: BiasDraft[] | null; time: string | null },
): Promise<{ lat: number; lng: number } | null> {
  if (!tripId) {
    if (!fallback || !targetDate) return null;
    return (
      unassignedBiasCenter(fallback.drafts, {
        date: targetDate,
        time: fallback.time,
      }) ?? null
    );
  }
  if (targetDate) {
    const { data: transits } = await supabase
      .from("events")
      .select("end_place_id, start_place_id")
      .eq("trip_id", tripId)
      .eq("kind", "transit")
      .lte("end_at", `${targetDate}T23:59:59`)
      .order("end_at", { ascending: false })
      .limit(1);
    // end_place_id が null は「到着地は出発地と同じ」の意味（NULL = 開始と同じ）。
    const placeId =
      transits?.[0]?.end_place_id ?? transits?.[0]?.start_place_id;
    if (placeId) {
      const { data: place } = await supabase
        .from("places")
        .select("lat, lng")
        .eq("id", placeId)
        .maybeSingle();
      if (place?.lat != null && place.lng != null) {
        return { lat: place.lat, lng: place.lng };
      }
    }
  }
  return fetchTripBiasCenter(supabase, tripId);
}

// 時差移動のうち便名（parseFlightNumber が読める形）を持つものだけ、その日の
// 便をここで1回引き、見つかった便（＋出発/到着空港の Google 解決）を各
// イベントに resolvedFlight/resolvedDeparturePlace/resolvedArrivalPlace として
// 埋め込んで返す（drafts.ts の deriveEventDraftItems がこれを見て、確定
// フォームで使う値を手打ちフライト番号確定〔applyFlight〕と同じ形に組み立てる。
// つまりユーザーがこの下書きを開く前に確定を終わらせておく）。見つからなけれ
// ば元のまま返す＝今まで通り確定時に手動検索（フライト番号機能）に回る。
// 1件ごとに提供元は最大3回叩く可能性があり秒間1リクエストの制限があるので
// 並行させず順番に引く。1件の失敗（枠切れ・提供元エラー等）で他を止めない。
//
// transit 以外（レストラン・買い物等）は、タイトルを店名の手がかりに Google
// の場所への解決を試みる（resolvedNamedPlace）。空港と違い座標を知らないので
// biasCenter（fetchBiasCenterForDate — その予定の日付にいるはずの場所）が
// 無ければ試さない。
async function prefetchFlights(
  supabase: ServiceClient,
  events: EventDraft[],
  tripId: string | null,
  unassignedDrafts: BiasDraft[] | null = null,
): Promise<StoredEventDraft[]> {
  const api = createFlightApi(supabase);
  const placesApiKey = process.env.GOOGLE_PLACES_SERVER_API_KEY;
  const result: StoredEventDraft[] = [];
  for (const ev of events) {
    if (ev.kind === "transit") {
      // 便名が引ければフライトとして解決する（空港は座標が既知）。引けない
      // 移動（配車・タクシー・列車・バス）は下の両端解決に落ちる。
      // LLM の表記ゆれ（"DL181" / "DELTA 181"）を吸収してから読む。
      const parsed = ev.vehicleNumber
        ? resolveFlightNumber(ev.vehicleNumber)
        : null;
      if (parsed) {
        try {
          const outcome = await lookupFlight(
            api,
            parsed.normalized,
            ev.startDate,
          );
          if (outcome.kind === "found") {
            const places = await resolveFlightPlaces(outcome.flight);
            result.push({
              ...ev,
              resolvedFlight: outcome.flight,
              resolvedDeparturePlace: places.departure,
              resolvedArrivalPlace: places.arrival,
            });
            continue;
          }
        } catch {
          // best-effort。確定時に通常の検索（手打ちと同じ経路）へフォールバックする。
        }
      }
      // 便名で引けない移動（配車・タクシー・列車・バス）。空港のような座標の
      // 既知点が無いので、出発地・到着地の文字列をそれぞれ Google の場所に
      // 解決する（レストラン等と同じ resolveNamedPlace）。降車地が空港のように
      // 施設名で書かれていればその場所に寄り、乗車地が住所しか無ければその
      // 住所の場所になる（寄せられないものを無理に寄せない）。
      const rideCenter =
        ev.departLocation || ev.arriveLocation
          ? await fetchBiasCenterForDate(supabase, tripId, ev.startDate, {
              drafts: unassignedDrafts,
              time: ev.startTime,
            })
          : null;
      if (placesApiKey && rideCenter) {
        const resolveEndpoint = async (name: string | null | undefined) => {
          if (!name) return null;
          try {
            return await resolveNamedPlace(name, null, {
              apiKey: placesApiKey,
              biasCenter: rideCenter,
            });
          } catch {
            // best-effort。確定時に手で選べる。
            return null;
          }
        };
        const departure = await resolveEndpoint(ev.departLocation);
        const arrival = await resolveEndpoint(ev.arriveLocation);
        if (departure || arrival) {
          // **乗降地の座標から TZ を引き直す。座標が取れた側は座標を優先する。**
          //
          // 抽出も乗降地から TZ を推定するが、埋め忘れることがあるし（実データ:
          // 乗車地が「ダニエル K イノウエ国際空港」と書けているのに departTz が
          // null だった）、埋めても推測でしかない。**座標は同じ文字列を Google が
          // 地理的に解決した結果**で、そこから引く tz-lookup はオフラインの表。
          // 推測より堅いので、こちらを上に置く。
          //
          // 移動日はこの値が「出発側か到着側か」の唯一の手がかりになる。空だと
          // 先頭候補＝出発側に落ちて、ハワイの乗車が東京の列に並ぶ。
          const depTz = timezoneOfPlace(departure) ?? ev.departTz;
          const arrTz = timezoneOfPlace(arrival ?? departure) ?? ev.arriveTz;
          result.push({
            ...ev,
            departTz: depTz,
            arriveTz: arrTz ?? depTz,
            resolvedDeparturePlace: departure,
            resolvedArrivalPlace: arrival,
          });
          continue;
        }
      }
      result.push(ev);
      continue;
    }
    // 場所の検索は location で行う（title は表示用の見出しでしかない。
    // レシート由来の仮予定は title が「夕食」等の汎用語になるため、なおさら
    // 検索語には使えない）。location が無ければ地図で探す手がかりが無いので
    // 試さない＝自由入力のまま（title で代用検索はしない。生半可な一致で
    // 誤った店に解決するより、素直に「解決できない」方が安全）。
    if (placesApiKey && ev.location) {
      try {
        const biasCenter = await fetchBiasCenterForDate(
          supabase,
          tripId,
          ev.startDate,
          { drafts: unassignedDrafts, time: ev.startTime },
        );
        // 住所があればバイアスは要らない（resolveNamedPlace 参照）。旅行に
        // 座標つきの場所が1つも無くても、住所さえ書いてあれば解決できる。
        if (biasCenter || ev.address) {
          const resolved = await resolveNamedPlace(ev.location, ev.address, {
            apiKey: placesApiKey,
            biasCenter: biasCenter ?? undefined,
          });
          if (resolved) {
            result.push({ ...ev, resolvedNamedPlace: resolved });
            continue;
          }
        }
      } catch {
        // best-effort。確定時は自由入力/自動解決（web のみ）へフォールバックする。
      }
    }
    result.push(ev);
  }
  return result;
}

// 費用の店名を Google の場所に解決する（events と同じ日付ベースの biasCenter・
// best-effort。見つからなければ receipt をそのまま返す）。
//
// カテゴリ「渡航」は対象外にする: 航空券等の店名（航空会社名）は「その日
// いた場所」ではなく取引の相手企業なので、位置バイアスでの解決が原理的に
// 成立しない（実機フィードバック: ZIPAIR の受取企業は成田近郊にあり、対象日
// バイアス〔到着地＝ホノルル〕で検索すると見つからない）。移動そのものの
// 場所（空港）は resolveAirportPlace が別途 resolvedFlight 経由で解決する。
// 2点間の距離（km）。移動日にどちらのバイアスの結果を採るかの判定に使う。
function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// その日が移動日（同じ暦日に出発して到着する移動がある日）なら、その移動の
// 出発地と到着地の座標を返す。移動日は「どちらのバイアスで引くべきか」が
// 事前に決まらないので、両方で引いて良い方を採るために使う。
async function transitDayEndpoints(
  supabase: ServiceClient,
  tripId: string | null,
  date: string | null,
): Promise<{ lat: number; lng: number }[]> {
  if (!tripId || !date) return [];
  const { data: transits } = await supabase
    .from("events")
    .select("start_place_id, end_place_id")
    .eq("trip_id", tripId)
    .eq("kind", "transit")
    .gte("start_at", `${date}T00:00:00`)
    .lte("start_at", `${date}T23:59:59`)
    .gte("end_at", `${date}T00:00:00`)
    .lte("end_at", `${date}T23:59:59`);
  const ids = (transits ?? [])
    .flatMap((t) => [t.start_place_id, t.end_place_id])
    .filter((id): id is string => !!id);
  if (ids.length === 0) return [];
  const { data: places } = await supabase
    .from("places")
    .select("lat, lng")
    .in("id", ids);
  return (places ?? [])
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({ lat: p.lat as number, lng: p.lng as number }));
}

// その通貨の1件目を自動で確定できるように、取り込みの時点で為替レートを
// 取っておく（fxRates.ts のコメント参照）。**旅行がまだ決まっていないことが
// あるので default_currency では引けない。** レシートの通貨を基準にした表を
// まるごと持っておき、確定の瞬間に旅行の精算通貨で引く。
async function attachFxRates(
  receipt: StoredReceipt | null,
): Promise<StoredReceipt | null> {
  if (!receipt || !/^[A-Z]{3}$/.test(receipt.currency ?? "")) return receipt;
  const { date } = receiptDate(receipt);
  if (!date) return receipt;
  const fxRates = await fetchFxRates(receipt.currency, date);
  return fxRates ? { ...receipt, fxRates } : receipt;
}

async function resolveReceiptPlace(
  supabase: ServiceClient,
  receipt: Receipt | null,
  tripId: string | null,
  unassignedDrafts: BiasDraft[] | null = null,
): Promise<StoredReceipt | null> {
  if (!receipt) return null;
  const apiKey = process.env.GOOGLE_PLACES_SERVER_API_KEY;
  // 地図に載せる場所の名前は location を優先する（receiptPlaceName 参照。
  // merchant は請求元なので、予約サイト経由だと代理店の名前で引いてしまう）。
  const placeName = receiptPlaceName(receipt);
  if (!apiKey || !placeName || receipt.category === "渡航") return receipt;
  const date = receipt.serviceDate ?? receipt.date;
  try {
    // 移動日は候補の空港が2つある。どちらのバイアスで引くべきかは時刻だけでは
    // 決まらない（成田 19:10 発 → ホノルル 07:25 着の日の 08:30 の朝食は、
    // 日本時間なら出発前・ハワイ時間なら到着後で、どちらも成立する）。
    // **両方のバイアスで引いて、バイアス中心に近い結果を採る。** 勝った方の
    // 経度がそのままタイムゾーンの答えにもなる（drafts.ts の pickTzByLongitude）。
    //
    // **一致度で選んではいけない。** 一致度は「名前がどれだけ似ているか」しか
    // 見ておらず、どちらの土地にいたかを語らない。実測: "THE ROYAL BAKERY" は
    // 成田バイアスだと埼玉の同名店（名前は完全一致）、ホノルルバイアスだと
    // Royal Hawaiian Bakery（部分一致）が返り、一致度では埼玉が勝ってしまう。
    // 距離なら埼玉 56km / ホノルル 11km でホノルルが勝つ。
    //
    // 距離が効くのは、**バイアス中心に近い結果＝その土地にその店が実在した**
    // 証拠だから。逆に 6000km 離れた結果は「バイアスが無視された＝その土地には
    // 無かった」を意味する。日本側の店もちゃんと日本を選ぶ（実測:
    // "TULLY'S COFFEE" は成田 0km / ホノルル 6588km で成田が勝つ）。
    //
    // 移動日でなければ従来どおり1回。
    const endpoints = await transitDayEndpoints(supabase, tripId, date);
    const biases =
      endpoints.length >= 2
        ? endpoints
        : [
            await fetchBiasCenterForDate(supabase, tripId, date, {
              drafts: unassignedDrafts,
              time: receipt.time,
            }),
          ].filter((b): b is { lat: number; lng: number } => !!b);
    let best: { place: PlaceCandidate; km: number } | null = null;
    for (const biasCenter of biases) {
      const r = await resolveNamedPlace(placeName, receipt.address, {
        apiKey,
        biasCenter,
      });
      if (!r) continue;
      const d = distanceKm(biasCenter, { lat: r.lat, lng: r.lng });
      if (!best || d < best.km) best = { place: r, km: d };
    }
    if (best) return { ...receipt, resolvedPlace: best.place };
    // バイアスが作れない旅行（座標つきの場所が1つも無い）でも、住所があれば
    // バイアス無しで解決できる（resolveNamedPlace 参照）。ここが無いと
    // 「解決できない → 座標なしの場所が増える → いつまでもバイアスが作れない」
    // の循環に入る。
    if (!receipt.address) return receipt;
    const r = await resolveNamedPlace(placeName, receipt.address, {
      apiKey,
    });
    return r ? { ...receipt, resolvedPlace: r } : receipt;
  } catch {
    return receipt;
  }
}

// 抽出本体（LLM 呼び出し）→ マージ判定 → 下書き保存。LLM 失敗時は throw する
// （リトライ可否の判定は呼び出し側）。
// 抽出の入口は3つある（受信・再試行・翌月の枠あけ待ちの drain）。上限の判定を
// 呼び出し側に置くと、入口が増えたときに付け忘れる — 実際、再試行の経路
// （retryDrain）だけ判定が無く、一度失敗したメールは上限に関係なく抽出され
// 続けていた（本番で当月 102 件 / 上限 100 件になっていた）。**判定はここ
// 1箇所に置き、抽出する道は必ずここを通す。**
async function runExtraction(
  supabase: ServiceClient,
  emailId: string,
  userId: string,
  raw: string,
): Promise<void> {
  if (await holdIfOverQuota(supabase, emailId, userId)) return;
  // 本文＋PDFテキストを作り（これが痩せ版）、許可ホストの明細リンクは fetch して本文に
  // 付加（enrichment）。候補旅行も渡して、抽出と同時にどの旅行か＋明細リンクを推論させる。
  const { subject, text: gatheredText } = await gatherReceiptText(raw, {
    fetchLink: fetchReceiptLink,
  });
  const trips = await fetchTripHints(supabase, userId);
  let text = gatheredText;
  const firstPass = await extractEmail(EXTRACT_MODEL, {
    subject,
    text,
    trips,
  });
  let extractResult = firstPass;

  // 第2パス: 明細が未許可ホストのリンク先にしか無いメール。LLM が特定したその URL
  // 1本だけを SSRF ガード付きで取得して本文に足し、もう1回だけ抽出し直す（第2パスの
  // detailUrl はさらに fetch しない＝ループ禁止）。取得失敗・LLM 失敗はどちらも
  // 第1パス結果で続行する（enrichment は best-effort）。
  if (firstPass.detailUrl && isUnknownReceiptHostUrl(firstPass.detailUrl)) {
    if (isLikelyUnsubscribeUrl(firstPass.detailUrl)) {
      // 予防: 配信解除/購読設定リンクらしき URL は fetch 自体をしない（ユーザの
      // メール購読を誤って操作するリスクを避ける）。admin には「疑い」として
      // 記録だけしておき、ドメインの扱いを判断する材料にする。
      await recordCandidateLink(supabase, firstPass.detailUrl, {
        skippedUnsubscribe: true,
      });
    } else {
      const linkText = await fetchReceiptLink(firstPass.detailUrl, {
        requireAllowedHost: false,
      });
      if (linkText && linkText.trim()) {
        const enriched = appendLinkText(text, firstPass.detailUrl, linkText);
        try {
          const secondPass = await extractEmail(EXTRACT_MODEL, {
            subject,
            text: enriched,
            trips,
          });
          // 未許可ホストを学習用に記録するのは、実際に下書きの内容を補えた時だけ
          // （LLM の detailUrl 誤報告等のノイズを候補表から除く。admin 管理ページに
          // 出るホストはドメイン名を見るだけで昇格判断できる）。
          if (extractionGainedDetail(firstPass, secondPass)) {
            await recordCandidateLink(supabase, firstPass.detailUrl);
          }
          // **第1パスの成果を失う結果は採らない。** 第2パスも LLM なので揺らぐ。
          // 実際に、ホテルの予約確認メールで第2パスが空を返し、第1パスが
          // 見つけていた宿泊の予定を捨てて恒久エラーになった。
          if (!extractionLostDetail(firstPass, secondPass)) {
            extractResult = secondPass;
            text = enriched; // 痩せ版(body_text)にもリンク先明細を残す（マージ判定の文脈）
          }
        } catch {
          // 第1パス結果にフォールバック（候補は記録しない＝再抽出できていない）
        }
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

  // 後からマージ: 同じ取引・予約の未確定下書きがあれば合体する。マージ判定は
  // 素の extraction（resolvedFlight を混ぜる前）で行う — findMerge は events を
  // まるごと LLM プロンプトに埋め込むので、確定済み相当のフライト詳細（空港
  // 座標等）を混ぜるとマージ判定に無関係なトークンで膨らむだけになる。
  const merge = await tryMerge(supabase, userId, emailId, extraction, text);

  if (merge) {
    // ターゲットの「自分の」extracted は残し、作業状態（pending draft 行）を合体結果で
    // 置き換える（確定済みは触らない）。便名が読めた時差移動は、保存の直前
    // （＝実際に下書きとして残る最終形が固まってから）にここで1回引き、見つかった
    // 便を events に resolvedFlight として埋め込む。deriveEventDraftItems（shared）
    // がこれを見て、確定フォームの値を手打ちフライト番号確定と同じ形に組み立てる
    // ので、ユーザーがこの下書きを開いた時点で既に「あとは保存するだけ」の状態に
    // なる（開いた瞬間にカードが一瞬出て確定する、というような見た目のばたつきが
    // 起きない）。時差移動以外（レストラン・買い物等）は店名を Google 解決し
    // resolvedNamedPlace に、費用は resolveReceiptPlace で同様に埋め込む。
    // 見つからなければ元のまま＝今まで通り確定時に手動検索/自由入力に回る
    // （best-effort、失敗しても抽出自体は続行）。
    const borrowed = await fetchBiasDrafts(supabase, userId, tripId);
    const merged = {
      receipt: await attachFxRates(
        await resolveReceiptPlace(
          supabase,
          merge.merged.receipt,
          tripId,
          borrowed,
        ),
      ),
      events: await prefetchFlights(
        supabase,
        merge.merged.events,
        tripId,
        borrowed,
      ),
    };
    await replacePendingDrafts(supabase, merge.targetId, merged);
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
    // 作業状態（draft 行）を抽出結果で作る（エラーからの再抽出では作り直し）。
    // resolvedFlight/resolvedNamedPlace/resolvedPlace の埋め込みは merge 分岐と
    // 同じ理由（上のコメント参照）で保存直前に行う。
    // ステータスを "extracted" にする**前に**この行を終わらせる: 受信箱は
    // status='extracted' を「表示してよい」の合図として使うため、先に status
    // を立てて後から draft 行を挿入すると、その間の一瞬だけ「メールの件名は
    // 見えるが中身（店名・金額）はまだ無い」半端な状態が受信箱に表示されて
    // しまう（実機フィードバック: 件名 "Fwd: Receipt from Howzit Brewing #liIG"
    // のまま一瞬表示され、その後に店名・金額の行に変わって見えた）。
    const borrowed = await fetchBiasDrafts(supabase, userId, tripId);
    const enriched = {
      receipt: await attachFxRates(
        await resolveReceiptPlace(supabase, receipt, tripId, borrowed),
      ),
      events: await prefetchFlights(supabase, events, tripId, borrowed),
    };
    await replacePendingDrafts(supabase, emailId, enriched);
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
    const kind = classifyFailure(e);
    // permanent 以外は再試行対象。rate_limit は Retry-After を尊重し、無ければ
    // 素の 1 分（バックオフしない＝次の cron で同条件で再挑戦）。
    const delay =
      kind === "rate_limit"
        ? Math.min(parseRetryAfterMs(e) ?? RETRY_BASE_MS, RETRY_MAX_MS)
        : backoffMs(0);
    await supabase
      .from("inbound_emails")
      .update({
        status: "error",
        extract_error: msg,
        extract_error_kind: kind,
        next_retry_at:
          kind === "permanent"
            ? null
            : new Date(Date.now() + delay).toISOString(),
      })
      .eq("id", emailId);
  }
}

// そのユーザの実効上限（docs/design/billing.md）。プランはまだ実装していないので、
// 「プランの上限」はアプリ側の定数。個別上書きは users の列（手動運用のみ）。
async function effectiveCapFor(
  supabase: ServiceClient,
  userId: string,
): Promise<number> {
  const { data } = await supabase
    .from("users")
    .select("monthly_email_cap_override")
    .eq("id", userId)
    .single();
  return effectiveEmailCap(MONTHLY_EMAIL_CAP, data?.monthly_email_cap_override);
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

// 当月の枠を使い切っていれば、抽出せず over_quota にして true を返す。
//
// 数えて比べるだけなので、**同時に届いた複数通が同じ数を読んで揃って通る**
// ことはあり得る（読んでから extracted_at が付くまでに間がある）。超過は
// 同時実行数ぶんに限られ、枠はコストの歯止めであって厳密な残高ではないので
// （docs/design/billing.md）、ここは許容する。カウンタを持って厳密にする案は
// 採らない — 実データとカウンタがずれる方が厄介。
// next_retry_at は消す: 枠切れは時間をおいても解けないので、再試行の列に
// 残しても毎分空振りするだけ。翌月に reprocessOverQuota が拾う。
async function holdIfOverQuota(
  supabase: ServiceClient,
  emailId: string,
  userId: string,
): Promise<boolean> {
  const cap = await effectiveCapFor(supabase, userId);
  if ((await monthlyExtractCount(supabase, userId)) < cap) {
    return false;
  }
  await supabase
    .from("inbound_emails")
    .update({ status: "over_quota", next_retry_at: null })
    .eq("id", emailId);
  return true;
}

// 受信メールをバックグラウンドで抽出して下書きを保存する。月間上限の判定は
// runExtraction が持つ（入口ごとに書かない）。
//
// **同じユーザの抽出は直列にする。** 並行に走らせると、同時に処理されたメールは
// お互いまだ下書きになっていないので**マージの候補として見えない**（同じ取引の
// レシートと銀行の通知が別々の費用として残る）。レシートをまとめて転送するのは
// 想定している使い方そのものなので、ここが揃わないと転送のたびに結果が変わる。
//
// ロックが取れなかった回は**何もしないで降りる**。メールは既に pending で
// 保存されているので、いま走っている側のループが拾う。取りこぼしても毎分の
// cron が pending を掃除する（drainPending）。
export async function extractInBackground(
  supabase: ServiceClient,
  userId: string,
): Promise<void> {
  if (!(await acquireExtractLease(supabase, userId))) return;
  try {
    await drainPending(supabase, { userId });
  } finally {
    await releaseExtractLease(supabase, userId);
  }
}

// まだ抽出していないメール（status='pending'）を古い順に1通ずつ処理する。
// 受信時（そのユーザぶんだけ）と、毎分の cron（全ユーザ）から呼ぶ。
//
// **呼び出し側が排他を持っていること。** ここは直列に回すだけで、ロックは見ない。
export async function drainPending(
  supabase: ServiceClient,
  opts: { userId?: string; deadline?: number } = {},
): Promise<void> {
  const deadline = opts.deadline ?? Date.now() + DRAIN_BUDGET_MS;
  // 進められなかった行。状態が変わらないので、外さないと同じページを引き続ける。
  const stuck = new Set<string>();

  while (Date.now() < deadline) {
    let q = supabase
      .from("inbound_emails")
      .select("id, user_id, raw")
      .eq("status", "pending")
      .not("raw", "is", null)
      .not("user_id", "is", null)
      .order("received_at", { ascending: true })
      .limit(PENDING_PAGE);
    if (opts.userId) q = q.eq("user_id", opts.userId);

    const { data: rows } = await q;
    const actionable = (rows ?? []).filter(
      (r) => r.raw && r.user_id && !stuck.has(r.id),
    );
    if (actionable.length === 0) return;

    for (const row of actionable) {
      if (Date.now() >= deadline) return;
      if (!row.raw || !row.user_id) continue;
      await attemptExtraction(supabase, row.id, row.user_id, row.raw);
      // 失敗した行は pending のまま残ることがある（次の回に回す）。
      stuck.add(row.id);
    }
  }
}

// 期限の来たリトライ対象（status='error' かつ next_retry_at <= now）を再抽出する。
// Cloudflare の毎分 cron（retry-extract）から呼ぶ。成功すれば runExtraction が status を
// 進める。再び失敗したらバックオフを延ばし、上限/恒久失敗で打ち切る。
// 1 回の drain の結果。呼び出し元（cron）が診断ログに使う。
export type RetryDrainSummary = {
  attempted: number;
  succeeded: number;
  rateLimited: boolean;
  failed: number;
};

// 1 回の実行で DB から取ってくる行数。**処理の上限ではなく取得の単位**
// （raw を丸ごと積むので一度に大量に持たない）。使い切ったら次のページを引く。
const RETRY_PAGE = 10;
const OVER_QUOTA_PAGE = 10;
const PENDING_PAGE = 10;

export async function retryDueErrors(
  supabase: ServiceClient,
  opts: { userId?: string; deadline?: number } = {},
): Promise<RetryDrainSummary> {
  // **止まる条件は「件数」ではなく「時間」。** 進める限り進む設計なので、
  // 何件で止めるかを決める根拠が無い（速い日は N 件で足踏みし、遅い日は
  // N 件でも関数の寿命を超える）。実際に有限なのは1回の実行に使える時間の方
  // なので、そちらで区切る。
  //
  // 流量そのものはレート制限が決める（429 が来たらその回は打ち切り、次の毎分
  // cron が同条件で再挑戦する＝制限が調速機）。時間の予算は「関数が返らない」
  // 「毎分の cron 同士が重なって同じ行を二重に処理する」を防ぐためのもの。
  const deadline = opts.deadline ?? Date.now() + DRAIN_BUDGET_MS;

  const summary: RetryDrainSummary = {
    attempted: 0,
    succeeded: 0,
    rateLimited: false,
    failed: 0,
  };

  const page = async () => {
    let q = supabase
      .from("inbound_emails")
      .select("id, user_id, raw, retry_count")
      .eq("status", "error")
      // 処理できない行（raw / user_id が無い）は条件から外す。飛ばすだけだと
      // 状態が変わらないので、引き直すたびに同じ行が返って前に進めなくなる。
      .not("raw", "is", null)
      .not("user_id", "is", null)
      .not("next_retry_at", "is", null)
      .lte("next_retry_at", new Date().toISOString())
      .order("next_retry_at", { ascending: true })
      // 同着の時は**受信の早い順**。レート制限に当たると期限の来ている行を全部
      // 同じ next_retry_at に押し出すので、next_retry_at だけでは全件が同着になり、
      // 並び順が Postgres の返す順（＝規定なし）に落ちる。実際、本番で 83 件が
      // 同一の値になっていて、受信順と抽出順が無関係にばらけていた。
      .order("received_at", { ascending: true })
      .limit(RETRY_PAGE);
    if (opts.userId) q = q.eq("user_id", opts.userId);
    const { data } = await q;
    return data ?? [];
  };

  // 処理した行は status か next_retry_at が動いてこの条件から外れるので、
  // 引き直せば必ず次に進む（同じ行を無限に拾うことはない）。
  for (let rows = await page(); rows.length > 0; rows = await page()) {
    if (Date.now() >= deadline) return summary;
    for (const row of rows) {
      if (Date.now() >= deadline) return summary;
      if (!row.raw || !row.user_id) continue;
      const attempt = (row.retry_count ?? 0) + 1;
      summary.attempted++;
      try {
        await runExtraction(supabase, row.id, row.user_id, row.raw);
        summary.succeeded++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "extract failed";
        const kind = classifyFailure(e);

        // レート制限に当たったら、この回はここで終わり。残りを投げても同じ 429 が
        // 返るだけで、行ごとにバックオフを伸ばす罰を配って回ることになる（以前の
        // 挙動）。期限の来ている行をまとめて押し出して break すれば、次の毎分 cron が
        // 同じ条件で再挑戦し、**通る分だけ通る**。制限そのものが調速機になるので、
        // こちらが流量を推定する必要はない。
        if (kind === "rate_limit") {
          const delay = Math.min(
            parseRetryAfterMs(e) ?? RETRY_BASE_MS,
            RETRY_MAX_MS,
          );
          const until = new Date(Date.now() + delay).toISOString();
          await supabase
            .from("inbound_emails")
            .update({
              extract_error: msg,
              extract_error_kind: "rate_limit",
              next_retry_at: until,
            })
            .eq("status", "error")
            .not("next_retry_at", "is", null)
            .lte("next_retry_at", new Date().toISOString());
          summary.rateLimited = true;
          return summary;
        }

        // transient は打ち切らない（障害が続いてもレシートを失わない）。retry_count は
        // バックオフの指数として使い、6h で頭打ち。最終的な回収は 90 日の expire。
        // unknown だけは MAX_RETRIES で蓋をする（誤分類の保険）。
        summary.failed++;
        const giveUp =
          kind === "permanent" ||
          (kind === "unknown" && attempt >= MAX_RETRIES);
        await supabase
          .from("inbound_emails")
          .update({
            retry_count: attempt,
            extract_error: msg,
            extract_error_kind: kind,
            next_retry_at: giveUp
              ? null
              : new Date(Date.now() + backoffMs(attempt)).toISOString(),
          })
          .eq("id", row.id);
      }
    }
  }
  return summary;
}

// 月間上限で保留された over_quota 行を、枠が空いた分だけ抽出する（翌月の自動再抽出）。
// 枠はユーザ単位で「CAP − 当月抽出数」。月替わりでカウントが 0 に戻ると drain される。
// retry と同じく Cloudflare の毎分 cron から呼ぶ＝「保留中の抽出を reconcile」する。
// retry と同じく、止まる条件は件数ではなく時間（DRAIN_BUDGET_MS）。
export async function reprocessOverQuota(
  supabase: ServiceClient,
  opts: { deadline?: number } = {},
): Promise<void> {
  const deadline = opts.deadline ?? Date.now() + DRAIN_BUDGET_MS;
  const remainingByUser = new Map<string, number>();
  // この回はもう進められないもの（枠を使い切ったユーザ・raw が無い行）。
  // 状態が変わらないので、外さないと同じページを引き続けてしまう。
  const stuckUsers = new Set<string>();
  const stuckRows = new Set<string>();

  while (Date.now() < deadline) {
    // 古い順＝受信が早いものから。
    const { data: rows } = await supabase
      .from("inbound_emails")
      .select("id, user_id, raw")
      .eq("status", "over_quota")
      .not("raw", "is", null)
      .not("user_id", "is", null)
      .order("received_at", { ascending: true })
      .limit(OVER_QUOTA_PAGE);
    const actionable = (rows ?? []).filter(
      (r) =>
        r.raw &&
        r.user_id &&
        !stuckUsers.has(r.user_id) &&
        !stuckRows.has(r.id),
    );
    if (actionable.length === 0) return;

    for (const row of actionable) {
      if (Date.now() >= deadline) return;
      if (!row.raw || !row.user_id) continue;
      let remaining = remainingByUser.get(row.user_id);
      if (remaining === undefined) {
        remaining =
          (await effectiveCapFor(supabase, row.user_id)) -
          (await monthlyExtractCount(supabase, row.user_id));
      }
      if (remaining <= 0) {
        remainingByUser.set(row.user_id, 0);
        stuckUsers.add(row.user_id);
        continue;
      }
      await attemptExtraction(supabase, row.id, row.user_id, row.raw);
      remainingByUser.set(row.user_id, remaining - 1);
      // 抽出が失敗した行は over_quota のまま残ることがある（次の回に回す）。
      stuckRows.add(row.id);
    }
  }
}
