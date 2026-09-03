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

export type DatedReceipt = {
  date: string;
  time: string | null;
  serviceDate: string | null;
  dateIsSettlement: boolean;
};

// 2つの候補（合体の対象と新しく届いた側）から、日付・時刻の出どころとして
// 正しい方を選ぶ。**レシート由来が銀行の通知に勝つ、片方向のルール。**
// 両方レシート由来／両方通知のみなら、より新しく分かった方（b＝incoming）を
// 使う——直近の情報のほうが確度が高い（例: 差額調整の通知がレシートの詳細を
// 補って更新することがある）。
export function chooseAuthoritativeDate<T extends DatedReceipt>(
  a: T,
  b: T,
): T {
  if (a.dateIsSettlement && !b.dateIsSettlement) return b;
  if (!a.dateIsSettlement && b.dateIsSettlement) return a;
  return b;
}
