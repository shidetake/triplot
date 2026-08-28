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
// **日時は1つだけ出す。** 以前は費用の日付と予定の日時が両方出ていて、ずれる
// ことがあった。判断に一番効くものが食い違って見えるのが一番よくない。
//
// 採るのは**費用の「使った日時」**（serviceDate があればそれ、無ければ支払日＋
// 支払時刻）。**仮予定の開始時刻は使わない** — 後払いの業態では「レシートの時刻
// から所要時間ぶん遡った時刻」を開始にしているので、実際に払った時刻より前に
// なる（夕食で 23:06 のレシート → 開始 21:06）。ここに出したいのは実際に使った
// 時刻なので、遡る前の値を採る。費用が無いメール（予約確認だけ等）のときだけ
// 予定の開始日時を使う。
export type InboxRowSummary = {
  title: string;
  // 名前の下に InlineDivider 区切りで並べる（空の項目は入らない）。
  parts: string[];
};

// 場所は**都市名**を優先する。この行で場所に求めているのは「どの旅行か」を
// 決める手がかりで、それは都市名だから。店名はタイトルに既に出ていて、番地は
// 判断に効かず、長くて行内で切れる。
//
// 解決済みの場所があればその locality（例: "Honolulu"）。解決できていなければ
// 抽出した生の文字列に落ちる（そのときだけ、タイトルと同じなら出さない
// — 店名がそのまま場所になっているだけで、2回言っても判断材料が増えない）。
// 決済代行の接頭辞は merchant からだけ落とすので、生の文字列は
// "SQ *HONOLULU COOKIE CO" のようにタイトルと完全一致しないことがある。

// 予定から場所の手がかりを取る。**移動は出発地**を採る（到着地ではない）。
// 到着地だと帰りの便で地元が出てしまい、旅行の判断に効かない。行きも帰りも
// 出発側に揃えておけば、少なくとも一貫して「そこから動いた場所」を指す。
function eventPlace(ev: EventDraft): string | null {
  if (ev.kind === "transit") return ev.departLocation || ev.arriveLocation || null;
  return ev.location || null;
}

// 場所が名前を言い直しているだけなら出さない。
//
// 完全一致だけでは足りない: 決済代行の接頭辞は merchant からだけ落とすので、
// 生の場所は "SQ *HONOLULU COOKIE CO" のように**名前を含むが一致しない**形に
// なる。かといって「含めば落とす」にすると、住所付きの場所
// （"Howzit Brewing, 330 Kamani St, Honolulu, HI"）まで消えて都市名を失う。
//
// なので**名前が場所のどれだけを占めるか**で決める。本番の下書きを実測すると
// 分布に谷があり、0.76 以上（"TST* HANA KOA BREWING" 等＝接頭辞が付いただけ）と
// 0.40 以下（住所付き）の間に1件も無かった。閾値はその空白帯の真ん中を採る。
const REDUNDANT_PLACE_RATIO = 0.6;

function isRedundantPlace(place: string, title: string): boolean {
  if (!title) return false;
  if (!place.toLowerCase().includes(title.toLowerCase())) return false;
  return title.length / place.length >= REDUNDANT_PLACE_RATIO;
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
  const when = receipt ? receiptDate(receipt) : null;
  if (when?.date) {
    const day = formatDayLabel(when.date, opts.locale);
    parts.push(when.time ? `${day} ${when.time}` : day);
  } else if (ev) {
    const day = formatDayLabel(ev.startDate, opts.locale);
    parts.push(ev.startTime ? `${day} ${ev.startTime}` : day);
  }

  const locality = receipt?.resolvedPlace?.locality ?? null;
  const place = locality || receipt?.location || (ev ? eventPlace(ev) : null);
  if (place && !isRedundantPlace(place, title)) parts.push(place);

  return { title, parts };
}
