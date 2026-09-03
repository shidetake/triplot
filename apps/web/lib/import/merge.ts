import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

import { nameTokens } from "@triplot/shared/import/placeMatch";

import { normalizeEventDraft, normalizeReceipt } from "./normalize";
import {
  applyReceiptEventTiming,
} from "@triplot/shared/import/receiptTiming";
import { chooseAuthoritativeDate } from "@triplot/shared/import/receiptDate";
import {
  type Extraction,
  eventDraftSchema,
  receiptSchema,
  sanitizeEventDraft,
} from "@triplot/shared/import/schema";

// 後からマージ：新しく届いたメールが、既存の未確定下書きと「同じ取引・同じ予約」かを
// 判定し、同一なら合体する。決済元に依存しない汎用判定（referenceId 一致・店名/金額/
// 日付の近さ・pending→確定/差額調整/スケジュール変更の関係など）を LLM に任せる。
// 候補の事前絞り込みだけ決定的に行う（LLM に渡す前の安いフィルタ）。

// text = 候補下書きの痩せ版本文（body_text）。マージ精度のため LLM に渡す。
// extraction = そのメールの実効値（未確定 draft 行から組み立てた作業状態）。
export type DraftCandidate = {
  id: string;
  extraction: Extraction;
  text?: string | null;
};

// "YYYY-MM-DD" の日数差（絶対値）。不正は Infinity。
function dayDiff(a: string, b: string): number {
  const pa = Date.parse(`${a}T00:00:00Z`);
  const pb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(pa) || Number.isNaN(pb)) return Infinity;
  return Math.abs(pa - pb) / 86_400_000;
}

// 抽出結果が指す日付たち（費用の取引日・利用日、予定の開始/終了日）。
function extractionDates(x: Extraction): string[] {
  const dates: (string | null)[] = [
    x.receipt?.date ?? null,
    x.receipt?.serviceDate ?? null,
    ...x.events.flatMap((e) => [e.startDate, e.endDate]),
  ];
  return dates.filter((d): d is string => !!d);
}

// 抽出結果が持つ取引/予約の識別番号たち。
function extractionRefIds(x: Extraction): string[] {
  const ids: (string | null)[] = [
    x.receipt?.referenceId ?? null,
    ...x.events.map((e) => e.referenceId),
  ];
  return ids.filter((r): r is string => !!r);
}

// 合体の候補を選ぶ（LLM に渡す前）。
//
// **ここは判定ではなく順位付け。** 合体するかどうかを決めるのは LLM で、ここは
// 「見せる数件をどう選ぶか」だけを決める。だから証拠は絞らず重ねてよい —
// 弱い証拠で候補に入れても、間違って合体することにはならない。
//
// 直した理由: 絞り込みが「番号一致 **または** 日付が14日以内」だったので、旅行中の
// メールは全部通ってしまい、実質フィルタが効いていなかった。そのうえ先頭 max 件で
// 切るので、**順不同の数件**が渡っていた。実データで、同時に未確定のメールが34件
// ある中から8件を引いていて、店のレシートと銀行の決済通知（金額が完全一致）が
// 12組中11組で合体できていなかった。
//
// 上限は据え置き。候補1件につき本文1,500字＋抽出結果を渡すので、1通の処理コストの
// 7割前後が候補で占められる（実測: 1通あたり約 $0.0105、候補8件で約14,000トークン）。
// **効くのは上限ではなく順位付け** — 正解が1〜2位に来れば8件で足りる。
function amountOf(x: Extraction): { total: number; currency: string } | null {
  const r = x.receipt;
  return r && r.total > 0 && r.currency
    ? { total: r.total, currency: r.currency }
    : null;
}

function merchantOf(x: Extraction): string | null {
  return x.receipt?.merchant?.trim() || null;
}

// 近さのスコア（大きいほど同一取引らしい）。**強い順に桁を分けて足す**ので、
// 弱い証拠が強い証拠を覆すことはない。
function closeness(incoming: Extraction, cand: Extraction): number {
  let score = 0;

  // 1. 取引/予約の識別番号が一致。単独でほぼ確定。
  const inRefs = new Set(extractionRefIds(incoming));
  if (extractionRefIds(cand).some((r) => inRefs.has(r))) score += 1000;

  // 2. 金額と通貨が完全一致。62.62 米ドルが偶然2件並ぶことはまず無い。
  const a = amountOf(incoming);
  const b = amountOf(cand);
  if (a && b && a.currency === b.currency) {
    if (a.total === b.total) score += 100;
    // 3. 片方がもう片方の一部（チップだけ別メール・Uber の分割請求）。
    //    合計が一致する保証は無いので弱い証拠として足すだけ。
    else if (Math.min(a.total, b.total) / Math.max(a.total, b.total) >= 0.5)
      score += 10;
  }

  // 4. 店名が似ている。**金額が割れていても効く**（チップ分割はここで拾う）。
  //    銀行の通知は全角・略記になりがち（"ＵＮＩＱＬＯ Ａｌａ Ｍｏａｎａ"）なので、
  //    正規化したトークンの一致度で見る。
  const im = merchantOf(incoming);
  const cm = merchantOf(cand);
  if (im && cm) {
    const it = nameTokens(im);
    const ct = nameTokens(cm);
    const inter = new Set(it).size + new Set(ct).size;
    if (inter > 0) {
      const set = new Set(ct);
      const shared = [...new Set(it)].filter((t) => set.has(t)).length;
      score += (shared / Math.max(new Set(it).size, set.size)) * 20;
    }
  }

  // 5. 日付が近い。同じ日なら +5、離れるほど減る。
  const inDates = extractionDates(incoming);
  const gaps = extractionDates(cand).flatMap((cd) =>
    inDates.map((id) => dayDiff(id, cd)),
  );
  const nearest = gaps.length > 0 ? Math.min(...gaps) : Infinity;
  if (Number.isFinite(nearest)) score += Math.max(0, 5 - nearest);

  return score;
}

export function selectMergeCandidates(
  incoming: Extraction,
  drafts: DraftCandidate[],
  opts: { windowDays?: number; max?: number } = {},
): DraftCandidate[] {
  const windowDays = opts.windowDays ?? 14;
  const max = opts.max ?? 8;
  const inDates = extractionDates(incoming);
  const inRefs = new Set(extractionRefIds(incoming));
  const refMatch = (d: DraftCandidate) =>
    extractionRefIds(d.extraction).some((r) => inRefs.has(r));
  const dateNear = (d: DraftCandidate) =>
    extractionDates(d.extraction).some((cd) =>
      inDates.some((id) => dayDiff(id, cd) <= windowDays),
    );
  // **識別番号が一致するものがあれば、それだけを見せる。**
  //
  // 同じ承認番号・予約番号を持つなら、同じ取引かどうかは判断ではなく事実。
  // それを他の候補と並べて LLM に選ばせると、選ぶたびにブレる（実測: 承認番号
  // 899402 を共有する3通が、走らせるたびに違うまとまり方をした）。
  //
  // 事実で決まるものは LLM に聞かず、**何と合体するか**はここで決める。
  // ただし**どう合体するか**は判断なので LLM に残す（仮売上に調整額を足すのか、
  // 既に最終額なので足さないのか、日付はどちらを採るのか）。
  //
  // 候補が1件に減るぶん、渡すトークンも減る（1通の処理コストの7割前後が候補）。
  const byRef = drafts.filter(refMatch);
  if (byRef.length > 0) {
    return byRef
      .map((d) => ({ d, s: closeness(incoming, d.extraction) }))
      .sort((x, y) => y.s - x.s)
      .slice(0, max)
      .map((x) => x.d);
  }
  return drafts
    .filter(dateNear)
    .map((d) => ({ d, s: closeness(incoming, d.extraction) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, max)
    .map((x) => x.d);
}

// LLM に見せる抽出結果から、**同一取引かの判断に使わないもの**を落とす。
//
// 取り込みの過程で付ける後付けデータ（為替レートの表・解決済みの場所・便情報）は
// 機械が使うもので、判断材料ではない。そのまま渡すと候補1件ごとに数百字の雑音に
// なり、**承認番号のような決定的な手がかりが埋もれる**（実データ: 承認番号が
// 一致しているのに合体しなかった。為替レートは29通貨ぶんある）。
//
// 落としても失われない。合体後の内容はこの後で場所もレートも付け直す
// （process.ts の resolveReceiptPlace / attachFxRates）。
function slim(x: Extraction): Extraction {
  const r = x.receipt;
  return {
    receipt: r
      ? ({
          merchant: r.merchant,
          total: r.total,
          currency: r.currency,
          date: r.date,
          serviceDate: r.serviceDate,
          time: r.time,
          category: r.category,
          location: r.location,
          address: r.address,
          items: r.items,
          referenceId: r.referenceId,
          isUpdate: r.isUpdate,
        } as Extraction["receipt"])
      : null,
    events: x.events,
  };
}

const mergeDecisionSchema = z.object({
  matchId: z
    .string()
    .nullable()
    .describe("同一取引/予約の既存下書きの id。確信できる同一が無ければ null"),
  merged: z
    .object({
      receipt: receiptSchema
        .nullable()
        .describe("合体後の費用。どちらにも費用が無ければ null"),
      events: z
        .array(eventDraftSchema)
        .describe("合体後の予定リスト（最新の正しい旅程）。無ければ空配列"),
    })
    .nullable()
    .describe("matchId がある時の合体後の内容。無ければ null"),
});

const MERGE_SYSTEM_PROMPT = [
  "あなたは旅行関連メール（レシート・決済・予約）を突き合わせるアシスタントです。",
  "新しく届いたメール1件と、既存の未確定下書き（複数）が与えられます。新しいメールが",
  "既存のどれかと『現実の同じ1つの取引・同じ予約』を指すかを判定してください。",
  "判断材料: 取引/予約の識別番号（referenceId）の一致、店名・金額・日付の近さ、",
  "pending→確定/金額更新/差額調整の関係、同じ予約のスケジュール変更・リマインダーの関係。",
  "同一なら matchId にその下書きの id、merged に合体後の内容を入れます。合体ルール: ",
  "店名・時刻・場所など詳しい情報は店のレシート側を優先。片方しか無い項目は埋め合わせる。",
  "【金額 total の扱い・重要】total は最終的に実際に請求された総額にする。既存取引に対する",
  "『差額調整・更新（確定）』メールの金額は“調整額（差分）”であって最終総額ではない。",
  "**元の取引が特定できる時だけ**合体する。特定の根拠は承認番号などの識別番号の一致か、",
  "本文が同じ取引を指していること。**根拠が無いなら合体しない** — 金額が小さいからといって",
  "手近な取引にくっつけてはいけない（別の取引の金額が狂う方がはるかに悪い）。",
  "元の取引が**仮売上（オーソリ）の金額**なら〔元の金額 ＋ 差額調整〕が最終総額。",
  "例: 元の利用 28.98 米ドル、差額調整 +0.07 → total は 29.05。",
  "ただし元の下書きが**店/サービス自身のレシートの最終額を既に持っている**なら足さない",
  "（足すと二重計上になる。差額調整はその最終額に含まれているので、合体しても total は",
  "そのまま）。どちらか迷ったら、店のレシートに書かれている総額を信じる。",
  "【チップ】飲食店では、後からチップぶんの差額調整が別メールで届く。米国のチップは",
  "会計の 15〜25%（18〜22% が最も多い）なので、**調整額が元の金額のその範囲に当たるなら",
  "まずチップ**であり、〔元の金額 ＋ チップ〕が最終総額になる。候補の行に『相手の N%』と",
  "書いてある場合、その割合はこちらが計算した事実なので信用してよい。",
  "【合体後の total は、元のどれよりも小さくならない】調整額そのものを最終総額にしない。",
  "例: 元 55.47、調整 11.09（20%＝チップ）→ total は 66.56。11.09 にはならない。",
  "【同じ取引について複数通届く場合】店やサービスは1つの取引について複数のメールを送る",
  "ことがある（最初のレシート・更新版・確定通知）。**件名が同じで金額も同じ**なら同じ取引",
  "として合体してよい。ただし両方に時刻があって食い違う場合は別の取引なので合体しない",
  "（例: 配車サービスの件名は『月曜日 午後の …ご乗車』のように曜日と時間帯を含むので、",
  "件名が違えば別の乗車）。",
  "【日付は現地のレシート側を優先】銀行・カード会社の通知の日付は自国の計上日で、現地の",
  "利用日と1日ずれることがある（時差）。**合体後の date と time は、店/サービス自身の",
  "レシートに書かれた値をそのまま使う**（銀行の通知しか日付を持たない時だけそちらを使う）。",
  "既存の下書きが既にレシート由来の日付を持っているなら、銀行の通知で上書きしないこと。",
  "【予定 events の扱い】merged の events は『合体後の最新の正しい旅程』の全量にする。",
  "スケジュール変更の通知なら、変更後の日時・便で元の予定を置き換える（新旧を両方",
  "並べない）。リマインダー・チェックイン案内なら既存の予定をそのまま維持し、そこに",
  "書かれた詳細（時刻・ターミナル等）だけ補完する。同じ予約を重複して増やさないこと。",
  "確信が持てない/別取引なら matchId・merged とも null。無理に合体しないこと。",
].join("");

// 新メール ＋ 候補下書き → 合体結果（同一が無ければ null）。
export async function findMerge(
  model: LanguageModel,
  incoming: { extraction: Extraction; text: string },
  candidates: DraftCandidate[],
): Promise<{ targetId: string; merged: Extraction } | null> {
  if (candidates.length === 0) return null;

  // 金額の比を**チップの範囲に入った時だけ**添える。
  //
  // LLM に割り算をさせない（11.09 ÷ 55.47 のような計算は外しうる）。ただし常に
  // 数値を並べると雑音になり、決定的な手がかりが埋もれる — 実際、為替レートの表を
  // 渡していた時に承認番号が埋もれて合体できなかった。**効く時だけ1行**にする。
  const inTotal = incoming.extraction.receipt?.total ?? null;
  const tipNote = (c: DraftCandidate): string => {
    const t = c.extraction.receipt?.total ?? null;
    if (!inTotal || !t || t <= 0) return "";
    const ratio = inTotal / t;
    if (ratio < 0.1 || ratio > 0.3) return "";
    return `\n  （新しいメールの金額はこの候補の ${(ratio * 100).toFixed(1)}%）`;
  };
  const candidateLines = candidates
    .map((c) => {
      const body = (c.text ?? "").trim().slice(0, 1500);
      return `- id=${c.id}: ${JSON.stringify(slim(c.extraction))}${tipNote(c)}${
        body ? `\n  本文: ${body}` : ""
      }`;
    })
    .join("\n");
  const prompt = [
    "新しく届いたメールの抽出結果:",
    JSON.stringify(slim(incoming.extraction)),
    "",
    "新しいメールの本文（抜粋）:",
    incoming.text.slice(0, 2000),
    "",
    "既存の未確定下書き:",
    candidateLines,
  ].join("\n");

  const { object } = await generateObject({
    model,
    schema: mergeDecisionSchema,
    system: MERGE_SYSTEM_PROMPT,
    prompt,
  });

  if (!object.matchId || !object.merged) return null;
  const target = candidates.find((c) => c.id === object.matchId);
  if (!target) return null;

  // **合体の結果が、元のどれよりも小さくなってはいけない。**
  //
  // 少額の会計に置く定額のチップ（$5 に $2 など）は、ここでは足せない。実測で
  // LLM は「ご利用金額**確定**のお知らせ 2.00」を最終額と読んで置き換える
  // （割合が 40% でチップに見えないうえ、文面が「確定」なので当然ではある）。
  // プロンプトで「少額なら定額チップ」と教えても3例とも変わらなかったので、
  // **不確かな指示を残さない**（雑音は決定的な手がかりを埋もれさせる）。
  //
  // 機械的に足すのも危ない。**確定額が承認額より小さいのは正常な場合がある**
  // （$100 で承認して $40 で確定するガソリンスタンド、一部返金）。足すと今度は
  // 過大計上になる。
  //
  // この歯止めがあるので、外れ方は「チップぶん足りない」に収まる（元の金額が
  // 消えることはない）。足りない分は受信箱の「他とまとめる → 合算する」で直せる。 重複なら大きい方が
  // 残り、チップ・調整なら足されるので、どちらの解釈でも小さくはならない。
  // 実測: 55.47 の飲食に 11.09（ちょうど 20%＝チップ）の調整が来た時、合体結果が
  // 11.09 になった＝調整額が元を丸ごと置き換えていた。プロンプトで直しても
  // LLM は揺れるので、機械的に弾く。
  //
  // 直し方は「大きい方に寄せる」。足すべきだったのか重複だったのかはここでは
  // 決められないので、**確実に言える下限**に留める（足りない分は手でまとめ直せる）。
  const merged = object.merged;
  const floor = Math.max(
    incoming.extraction.receipt?.total ?? 0,
    target.extraction.receipt?.total ?? 0,
  );
  if (merged.receipt && merged.receipt.total < floor) {
    console.warn(
      "[import] merge total below parts",
      JSON.stringify({ got: merged.receipt.total, floor }),
    );
    merged.receipt.total = floor;
  }

  // **日付・時刻の出どころは LLM に決めさせない。** 合体のたびに再判断させると、
  // 候補の生テキスト（銀行の通知本文）が引力になって崩れることがある（実データ:
  // レシート由来の日付が2回連続で正しく合体されたのに、最終的な下書きは銀行の
  // 通知日に戻っていた）。target（既存の下書き）と incoming（今回のメール）
  // それぞれ自身の抽出結果を比べ、レシート由来が銀行の通知に必ず勝つ片方向の
  // ルールで機械的に決める。
  if (merged.receipt) {
    const authoritative = chooseAuthoritativeDate(
      target.extraction.receipt ?? {
        date: merged.receipt.date,
        time: merged.receipt.time,
        serviceDate: merged.receipt.serviceDate,
        dateIsSettlement: merged.receipt.dateIsSettlement,
      },
      incoming.extraction.receipt ?? {
        date: merged.receipt.date,
        time: merged.receipt.time,
        serviceDate: merged.receipt.serviceDate,
        dateIsSettlement: merged.receipt.dateIsSettlement,
      },
    );
    merged.receipt.date = authoritative.date;
    merged.receipt.time = authoritative.time;
    merged.receipt.serviceDate = authoritative.serviceDate;
    merged.receipt.dateIsSettlement = authoritative.dateIsSettlement;
  }

  const normalizedReceipt = merged.receipt
    ? normalizeReceipt(merged.receipt)
    : null;
  const normalizedEvents = merged.events
    .map(sanitizeEventDraft)
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .map(normalizeEventDraft);

  return {
    targetId: object.matchId,
    merged: {
      receipt: normalizedReceipt,
      // receipt由来の仮予定の時刻は、確定した receipt の日時から機械的に
      // 埋め直す（LLM には startTime/endTime を作らせない。プロンプト参照）。
      events: applyReceiptEventTiming(normalizedReceipt, normalizedEvents),
    },
  };
}
