import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

import { normalizeEventDraft, normalizeReceipt } from "./normalize";
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

// 合体の候補を絞る（LLM に渡す前）: referenceId 一致 or どれかの日付が windowDays 以内。
// referenceId 一致を優先して先頭に並べる。
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
  return drafts
    .filter((d) => refMatch(d) || dateNear(d))
    .sort((a, b) => Number(refMatch(b)) - Number(refMatch(a)))
    .slice(0, max);
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
  "『差額調整・更新（確定）』メールの金額は“調整額（差分）”であって最終総額ではない。その",
  "場合は〔元の取引金額 ＋ 差額調整〕を計算して最終総額にすること。差額調整メールの金額を",
  "そのまま total にしてはいけない。例: 元の利用 28.98 米ドル、差額調整 +0.07 → total は 29.05。",
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

  const candidateLines = candidates
    .map((c) => {
      const body = (c.text ?? "").trim().slice(0, 1500);
      return `- id=${c.id}: ${JSON.stringify(c.extraction)}${
        body ? `\n  本文: ${body}` : ""
      }`;
    })
    .join("\n");
  const prompt = [
    "新しく届いたメールの抽出結果:",
    JSON.stringify(incoming.extraction),
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
  if (!candidates.some((c) => c.id === object.matchId)) return null;
  return {
    targetId: object.matchId,
    merged: {
      receipt: object.merged.receipt
        ? normalizeReceipt(object.merged.receipt)
        : null,
      events: object.merged.events
        .map(sanitizeEventDraft)
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .map(normalizeEventDraft),
    },
  };
}
