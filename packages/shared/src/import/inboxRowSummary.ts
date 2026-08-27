import { formatDayLabel } from "../schedule";

import { receiptDate, type StoredReceipt } from "./drafts";
import type { InboxRow } from "./inboxRows";
import type { EventDraft } from "./schema";

// 受信箱の1行に出す内容。
//
// **この画面の仕事は「どの旅行に割り当てるか決める」ことだけ**（確定は各旅行の
// 画面で行う）。なので載せるのは、その判断に効くもの＝**日付**と**場所**、それに
// 「どのメールか思い出す」ための**名前と金額**だけにする。
//
// 以前は費用の行（金額・日付・カテゴリ・場所）と予定の行（タイトル・日時）を
// 別々に出していた。データの形をそのまま写した結果で、同じことを2回言う箇所が
// あった（Uber なら費用のカテゴリ「現地移動」と予定のタイトル「移動」）。
// カテゴリと予定タイトルは旅行の判断に効かないので落とす。
//
// **日付は1つだけ出す。** 以前は費用の日付（カード利用通知の日）と予定の日時
// （実際に乗った時刻）が両方出ていて、TZ の差で1日ずれることがあった。判断に
// 一番効くものが食い違って見えるのが一番よくない。予定があればその開始日時
// （＝実際にそこに居た時刻）、無ければ費用の「使う日」を採る。
export type InboxRowSummary = {
  title: string;
  // 名前の下に InlineDivider 区切りで並べる（空の項目は入らない）。
  parts: string[];
};

// 予定から場所の手がかりを取る（transit は到着地→出発地の順。降車地の方が
// 「どこに居たか」を表す）。
function eventPlace(ev: EventDraft): string | null {
  if (ev.kind === "transit") return ev.arriveLocation || ev.departLocation || null;
  return ev.location || null;
}

export function inboxRowSummary(
  row: InboxRow | undefined,
  opts: {
    locale: string;
    // 名前が何も取れないときの最後の手段（メールの件名）。
    subject: string | null;
    fallbackTitle: string;
    formatAmount: (total: number, currency: string) => string;
  },
): InboxRowSummary {
  const receipt = (row?.receipt ?? null) as StoredReceipt | null;
  const events = row?.events ?? [];
  const title =
    receipt?.merchant || events[0]?.title || opts.subject || opts.fallbackTitle;

  const parts: string[] = [];
  if (receipt) parts.push(opts.formatAmount(receipt.total, receipt.currency));

  const ev = events[0];
  if (ev) {
    const day = formatDayLabel(ev.startDate, opts.locale);
    parts.push(ev.startTime ? `${day} ${ev.startTime}` : day);
  } else if (receipt) {
    const when = receiptDate(receipt);
    if (when.date) {
      const day = formatDayLabel(when.date, opts.locale);
      parts.push(when.time ? `${day} ${when.time}` : day);
    }
  }

  // 場所が名前と同じなら出さない。店名がそのまま場所になっているだけで、
  // 2回言っても割り当ての判断材料が増えない（畳んだら目立つようになった）。
  // 行の構造は変わらない（名前＋メタ1行のまま）ので、行の高さは揃ったまま。
  const place = receipt?.location || (ev ? eventPlace(ev) : null);
  if (place && place !== title) parts.push(place);

  return { title, parts };
}
