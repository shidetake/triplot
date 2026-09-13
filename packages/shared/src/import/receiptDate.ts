// 合体（マージ）のたびに「レシートの日付」と「銀行/カード会社の通知の日付」の
// どちらを採るかを LLM に判断させると、指示（レシート優先）を書いていても
// 崩れることがある（実データ: 店のレシート2通〔ともに4/30〕が銀行の通知
// 〔5/1〕へ2回連続で合体したのに、最終的な下書きは5/1に戻っていた。合体の
// たびに候補の生テキスト＝銀行の通知本文がそのまま渡り続け、そこに書かれた
// 「5/1」が繰り返し引力として働ったと見られる）。
//
// この判断自体は難しくない（レシートは常に銀行の通知に勝つ、片方向のルール）
// ので、機械的に決める。難しいのは「このメール自身が店のレシートか、銀行の
// 通知か」という1通単位の判定で、そこだけは抽出時に LLM に一度だけ聞く
// （receiptSchema.dateIsSettlement）。

// 「このレシートはいつの出来事か」を決めるのに要る最小の形。費用の日付
// （receiptDate）も、レシート由来の仮予定の時間帯（receiptTiming.ts）も
// この3つだけで決まる。
export type ReceiptWhen = {
  date: string;
  time?: string | null;
  serviceDate?: string | null;
};

// レシートから、その出来事の日付と時刻を決める。費用の日付（expenses.paid_at
// に入る値）も、レシート由来の仮予定を置く日も、ここが単一の真実。
//
// **費用が持てる日付は paid_at ひとつだけ**なので、「支払った日」と「実際に
// 使う日」が離れるもの（航空券は数か月前に購入、宿は退室日に決済、観光地の
// 前売券は行く前に購入）はどちらか一方しか残せない。旅程に沿って読める方を
// 採り、serviceDate（搭乗日・チェックイン日・利用日）があればそれを採る。
//
// **時刻を捨てるのは、使う日が買った日と違う時だけ。** レシートの時刻は
// 購入時刻なので、使う日と組み合わせると実在しない日時になる。逆に同じ日
// （その場で買ってその場で使う。飲食店の予約、当日券）なら、購入時刻は
// その日の実在する時刻なので捨てる理由が無い——実データでも、使う日を持つ
// 11件のうち9件は買った日と同じ日だった。
export function receiptDate(r: ReceiptWhen | null): {
  date: string;
  time: string | undefined;
} {
  if (!r) return { date: "", time: undefined };
  if (r.serviceDate && r.serviceDate !== r.date) {
    return { date: r.serviceDate, time: undefined };
  }
  return { date: r.serviceDate ?? r.date, time: r.time ?? undefined };
}

// 借りる相手＝同じメールから出た予定の、時刻の持ち主としての最小の形。
export type SiblingEventWhen = {
  startDate?: string | null;
  startTime?: string | null;
  fromReceipt?: boolean | null;
};

// レシートが指す「出来事の瞬間」。**仮費用の日時も仮予定の起点もこれ1つで
// 決まる。**
//
// 以前は費用と予定が別々にこれを決めていて、費用側だけが2つ多く規則を持って
// いた（使う日の優先と、予約の予定からの時刻の借用）。同じ事実から出発して
// いるのに片方だけ正解する状態で、実データでは Diamond Head の入場券が
// 費用 5/2 13:00・仮予定 4/18 と別の日に並んだ。**経路が2本あることが原因**
// なので、1本にして、予定側は起点を所要時間で伸ばすだけにする。
//
// kind は「その時刻が何の瞬間か」。伸ばす向きが変わる:
//   payment … 支払いの瞬間。業態で前後が決まる（会計は最後、カフェは先払い）
//   start   … 予約の開始の瞬間。前に伸ばす（入場時刻から滞在が始まる）
//   null    … 時刻が分からない。根拠の無い時間帯を作らない
export type MomentKind = "payment" | "start";
export type ReceiptMoment = {
  date: string;
  time: string | null;
  kind: MomentKind | null;
};

export function receiptMoment(
  r: ReceiptWhen | null,
  siblings: readonly SiblingEventWhen[] = [],
): ReceiptMoment {
  const base = receiptDate(r);
  if (!base.date) return { date: "", time: null, kind: null };
  if (base.time) return { date: base.date, time: base.time, kind: "payment" };
  // 時刻が無い＝使う日を採って購入時刻を捨てた／通知がそもそも時刻を持たない。
  // **本当の時刻は同じメールの予約の予定が持っている**（搭乗・乗車・入場）。
  //
  // 借りる相手は予約から作った予定に限る。レシートから作った仮予定は支払いの
  // 瞬間の写しなので、そこから借りると導いた値を読み返すことになり、実在しない
  // 日時が経路を変えて復活する。
  //
  // 借りるのは開始時刻で、同じ日に複数あればいちばん早いもの。宿泊は終日で
  // 開始時刻を持たないので借りる相手にならない。
  let borrowed: string | null = null;
  for (const ev of siblings) {
    if (ev.fromReceipt) continue;
    if (!ev.startDate || !ev.startTime) continue;
    if (ev.startDate !== base.date) continue;
    if (!borrowed || ev.startTime < borrowed) borrowed = ev.startTime;
  }
  return borrowed
    ? { date: base.date, time: borrowed, kind: "start" }
    : { date: base.date, time: null, kind: null };
}

export type DatedReceipt = {
  date: string;
  time: string | null;
  serviceDate: string | null;
  dateIsSettlement: boolean;
  // 日付とセットで動く（どの暦で書かれた日付かの註記）。日付だけ勝った側の
  // ものにして註記を置いていくと、別の暦の日付に別の国の註記が付く。
  settlementTz?: string | null;
  // 同じくセットで動く（その日付を供給したメールの送信時刻。drafts.ts 参照）。
  sentAt?: string | null;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

// 2つの候補（合体の対象と新しく届いた側）から、日付・時刻の出どころとして
// 正しい方を選ぶ。**レシート由来が銀行の通知に勝つ、片方向のルール。**
//
// `summed` は「合体で金額が足し合わされた」＝片方がもう片方への追加
// （チップ・差額調整）だった、という意味。**その時は古い方の日付を採る。**
// 調整は後からしか来ない — 未来の決済を先に調整することはできないので、
// 取引が起きたのは必ず古い方の日付になる。実データ: 4/30 の飲食が
// 〔5/1 の利用 67.02 ＋ 5/2 の調整 12.06〕として届き、新しい方を採ったせいで
// 合体後が 5/2 になっていた。
//
// **予約は足し算にならないので、この規則には掛からない**（5/1 に 5/2 の予約を
// して 5/2 に決済されたなら日付は 5/2 でよく、金額は置き換わって足されない）。
//
// **銀行の通知どうしの合体は、常に古い方の日付を採る**（足し算になったかに
// 関わらず）。合体したということは同じ取引なので、先に届いた「利用のお知らせ」
// が取引の日を持ち、確定・調整の通知は必ずその後にしか来ない。実データ:
// 同じ承認番号の〔5/2 の利用 50 ＋ 5/4 の確定 5〕が金額の足し算にならず
// （＝下の summed に掛からず）新しい方を採ってしまい、5/1 の会計が 5/3 に
// なっていた。
//
// **レシートどうしなら、より新しく分かった方（b＝incoming）を使う**——直近の
// 情報のほうが確度が高い（例: 予約の確認メールを当日の明細が上書きする）。
// レシートは取引そのものの記録なので、後から届いた方が古い日付を指していても
// それが訂正である可能性がある。
export function chooseAuthoritativeDate<T extends DatedReceipt>(
  a: T,
  b: T,
  opts: { summed?: boolean } = {},
): T {
  if (a.dateIsSettlement && !b.dateIsSettlement) return b;
  if (!a.dateIsSettlement && b.dateIsSettlement) return a;
  const earlierWins = opts.summed || (a.dateIsSettlement && b.dateIsSettlement);
  if (earlierWins && YMD_RE.test(a.date) && YMD_RE.test(b.date)) {
    return a.date < b.date ? a : b;
  }
  return b;
}
