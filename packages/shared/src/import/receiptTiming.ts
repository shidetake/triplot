import { addDays, formatMinutes, parseWall } from "../schedule";
import type { EventDraft, Receipt } from "./schema";

// レシート由来の仮予定（飲食・土産・衣服・エンタメ・カジノの「既に済んだ消費」を
// カレンダー上に置く予定）の開始/終了を、レシートの日時＋予定の見出しから
// **機械的に**決める。
//
// 「この予定は何をした時間か」（朝食/昼食/夕食/カフェ/バー/買い物/観光…）を
// 品目の中身から判断するのは意味理解が要るので LLM の仕事のまま。だが、
// 見出しが決まった後の「所要時間はどれくらいか」「レシート時刻を開始と終了の
// どちらに使うか」は業態ごとの固定表と足し算/引き算でしかなく、判断の余地が
// 無い。実測で、この計算を毎回 LLM にやらせると合体のたびに作り直され、
// ずれることがあった（例: 品川-京都の新幹線が合体のたびに時刻を持ち直した
// のと同じ構造）。ここに切り出して機械的に固定する。
//
// 決済のタイミングは業態で異なる: カフェは注文時に先払いが基本なので、
// レシート時刻を開始として、そこから所要時間ぶん進めた時刻を終了にする。
// それ以外（会計は最後が基本）は、レシート時刻を終了として、そこから
// 所要時間ぶん遡った時刻を開始にする。
const START_ANCHORED_TITLES = new Set(["カフェ"]);

// 所要時間の目安（分）。触れない見出しは「その他の判断しづらいもの」として
// 1時間。値の根拠はプロンプトの旧記述と同じ（実測ではなく目安。ユーザーが
// 後で調整する前提）。
const DURATION_MINUTES: Record<string, number> = {
  カフェ: 30,
  軽食: 30,
  買い物: 30,
  朝食: 60,
  昼食: 60,
  夕食: 120,
  ディナー: 120,
  バー: 60,
  観光: 60,
};
const DEFAULT_DURATION_MINUTES = 60;

export type ReceiptEventTiming = {
  kind: "timed" | "allday";
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
};

// receiptDate/receiptTime は正規化済みのレシートの date/time（後処理の日付
// 修正が済んでいる前提）。receiptTime が無い（銀行の通知等、時刻を持たない）
// 時は、根拠の無い時間帯を作らない — allday のまま日付だけ置く。
export function deriveReceiptEventTiming(
  title: string,
  receiptDate: string,
  receiptTime: string | null,
): ReceiptEventTiming {
  if (!receiptTime) {
    return {
      kind: "allday",
      startDate: receiptDate,
      startTime: null,
      endDate: null,
      endTime: null,
    };
  }
  const duration = DURATION_MINUTES[title] ?? DEFAULT_DURATION_MINUTES;
  const anchor = parseWall(`${receiptDate}T${receiptTime}`).minutes;
  const [aMin, bMin] = START_ANCHORED_TITLES.has(title)
    ? [anchor, anchor + duration]
    : [anchor - duration, anchor];

  const at = (min: number) => {
    // 日をまたぐ場合、通算分は 0〜1439 に折り返し、日付側に繰り上げ/繰り下げる。
    const dayShift = Math.floor(min / 1440);
    const wrapped = ((min % 1440) + 1440) % 1440;
    return { date: addDays(receiptDate, dayShift), time: formatMinutes(wrapped) };
  };
  const start = at(aMin);
  const end = at(bMin);
  return {
    kind: "timed",
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
  };
}

// receipt由来の仮予定（fromReceipt=true）の時刻を、確定した receipt の日時
// から機械的に埋め直す。他の予定（本物の予約・旅程）には触らない。
export function applyReceiptEventTiming(
  receipt: Receipt | null,
  events: EventDraft[],
): EventDraft[] {
  if (!receipt) return events;
  return events.map((e) => {
    if (!e.fromReceipt) return e;
    const timing = deriveReceiptEventTiming(e.title, receipt.date, receipt.time);
    return { ...e, ...timing };
  });
}
