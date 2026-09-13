import { addDays, formatMinutes, parseWall } from "../schedule";
import {
  receiptMoment,
  type ReceiptWhen,
  type SiblingEventWhen,
} from "./receiptDate";
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

// kind は "timed" 固定（allday にはならない）。レシート由来の仮予定は常に
// timed という決定を型で縛る——「時刻が無ければ allday」という後退を、次に
// 誰かがここを触った時にコンパイラが弾けるようにする。
export type ReceiptEventTiming = {
  kind: "timed";
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
};

// 受け取るのはレシートそのもの（正規化済み＝後処理の日付修正が済んでいる
// 前提）。**日付と時刻は receiptDate で決める。** 前売券・航空券のように
// 「買った日」と「使う日」が離れるレシートは、仮予定を置くべきなのは使う日で、
// 買った日ではない（実データ: 4/18 に買った Diamond Head の入場券の仮予定が
// 4/18 に置かれていた。費用の側は使う日＝5/2 に出ていたので、同じレシートの
// 費用と予定が別の日に並んでいた）。
//
// **日付の決め方を引数で渡さない**のは、取り込み時（applyReceiptEventTiming）と
// 表示時（drafts.ts の retimedFromReceipt）の2箇所から呼ばれるため。
// 別々に渡す形にすると、片方だけ直して食い違う（同じ形の不具合を kind で
// 一度やっている）。
//
// 時刻が無い（銀行の通知等、時刻を持たない／使う日を採って購入時刻を捨てた）
// 時は、根拠の無い時間帯を作らない — startTime/endTime は null のまま日付だけ
// 置く。
//
// **kind は timed のまま変えない。** レシート由来の仮予定は「1日の中の出来事
// として捉える予定」で定義され（schema.ts 参照）、それは時刻が分かるかとは
// 別の話。以前はここで allday に落としていて、sanitizeEventDraft が
// timeFromReceipt を見て一度 timed に決めた直後にこの関数が上書きし、時刻の無い
// レシート（銀行の通知等）由来の仮予定が結局 allday で保存されていた
// （実データ: 108通中2通で再現）。
export function deriveReceiptEventTiming(
  title: string,
  receipt: ReceiptWhen,
  // 同じメールから出た予定。時刻を持たないレシートは、予約の予定が持つ開始
  // 時刻を借りる（receiptMoment）。費用の側と同じ関数を通るので、両者の起点が
  // 食い違うことは無い。
  siblings: readonly SiblingEventWhen[] = [],
): ReceiptEventTiming {
  const { date, time, kind } = receiptMoment(receipt, siblings);
  if (!time) {
    return {
      kind: "timed",
      startDate: date,
      startTime: null,
      endDate: null,
      endTime: null,
    };
  }
  const duration = DURATION_MINUTES[title] ?? DEFAULT_DURATION_MINUTES;
  const anchor = parseWall(`${date}T${time}`).minutes;
  // 予約から借りた開始時刻は、そこから滞在が始まる（入場・乗車）。支払いの
  // 瞬間だけが業態で前後に分かれる。
  const forward = kind === "start" || START_ANCHORED_TITLES.has(title);
  const [aMin, bMin] = forward
    ? [anchor, anchor + duration]
    : [anchor - duration, anchor];

  const at = (min: number) => {
    // 日をまたぐ場合、通算分は 0〜1439 に折り返し、日付側に繰り上げ/繰り下げる。
    const dayShift = Math.floor(min / 1440);
    const wrapped = ((min % 1440) + 1440) % 1440;
    return { date: addDays(date, dayShift), time: formatMinutes(wrapped) };
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

// **時間帯をレシートから作る対象かどうかは、印ではなく観察で決める。**
//
// 印（timeFromReceipt）は LLM が付けるもので、同じメールでも付いたり付かなかったり
// する。実データ: カードの利用通知から作られた「Snorkel Rentals at Hanauma Bay」が、
// ある回は決済時刻を開始に写した時間付きの予定、別の回は印の無い終日の予定になった。
// メールの中身は変わっていない。
//
// 印が無くても、**自分の時刻を持たない予定は時刻の出どころがレシートしかない**。
// そこは判断ではなく事実なので、こちらで決める。
//
// 移動は対象外——年表の境界になる予定で、種別を降ろすと境界が消える。宿泊のように
// 複数日にまたがる終日の予定も対象外で、1時間の枠にしてはいけない。
function takesTimeFromReceipt(e: EventDraft): boolean {
  if (e.kind === "transit") return false;
  if (e.timeFromReceipt) return true;
  // 自分の時刻を持っている＝メールに書かれた事実。触らない。
  if (e.startTime) return false;
  if (e.endDate && e.endDate !== e.startDate) return false;
  return true;
}

// 対象の予定の時間帯を、確定した receipt の日時から機械的に埋め直す。
// **埋めたものには印を立てる**——伸ばした時間帯の片端は見積もりなので、後段が
// それを事実として読み返さないようにする（重なりの解き方・時刻の借り先）。
export function applyReceiptEventTiming(
  receipt: Receipt | null,
  events: EventDraft[],
): EventDraft[] {
  if (!receipt) return events;
  return events.map((e) => {
    if (!takesTimeFromReceipt(e)) return e;
    const timing = deriveReceiptEventTiming(e.title, receipt, events);
    return { ...e, ...timing, timeFromReceipt: true };
  });
}

export { takesTimeFromReceipt };
