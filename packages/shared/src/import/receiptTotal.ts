// 合体（マージ）した後の金額を決める。
//
// **足すかどうかを合体時に推測させない。** 1通ごとに「その金額はその取引の
// 総額か、既に届いている取引への追加ぶん（差額）か」を抽出時に答えさせ
// （`receiptSchema.totalIsDelta`）、足し算はここで機械的にやる。
//
// 合体時に判断させると揺れる。実データ: ソニー銀行の「ご利用金額確定の
// お知らせ」6組のうち5組は足せて、$50 の会計に $5（10%）の1組だけ足せなかった
// ——プロンプトに「米国のチップは 15〜25%、その範囲ならチップとして足す」と
// 書いてあり、10% がその外だったため。範囲を広げても境目が動くだけで、
// 「割合で見分ける」ことを**主**にする限り無くならない。
//
// 1通で完結する問い（このメールの金額は何か）は、複数通を見比べる判断より
// ずっと安定する。`dateIsSettlement` と同じ考え方。
//
// **差額かどうかはメールに書いてある**——ことがある。ソニー銀行の確定通知は
// 「ご利用金額の確定により、ご利用金額の**更新**がありました」「ご利用金額
// または**差額調整金額**がマイナスの場合は払戻です」と書いたうえで、会計の
// 一部（チップぶん）の額を載せる。実際、店のレシートが 79.08 の会計は
// 〔利用 67.02 ＋ 確定 12.06〕で届いていた。
//
// **書いていない発行元のために、割合の網を下に敷く。** 文面が素っ気なければ
// 印は false で返り、そのまま足されずに終わる。そこで「同じ取引の決済通知が
// 2通で、後の1通が確定・調整で、額が前の1通のチップに当たる割合」なら足す。
// これは推測なので**主にはしない**（印が付いていればそちらが勝つ）。
//
// **網を狭くするのは、外し方が非対称だから。** 足し損ねは金額が足りないだけで、
// 受信箱の「他とまとめる → 合算する」で直せる。余計に足すと黙って過大計上に
// なり、気付く手がかりが無い。だから「チップ以外の説明が付きにくい」範囲に
// 限る。
//
// **金額の大小そのものでは決めない。** 発行元によっては確定通知が最終総額を
// 載せる（$100 で承認して $40 で確定するガソリンスタンド、一部返金）。それは
// 下の範囲の外に落ちる。

export type TotaledReceipt = {
  total: number;
  currency: string;
  // その金額が、既存の取引への追加ぶん（差額・調整・後追いのチップ）か。
  // 総額なら false。古い下書きには無いので undefined も総額として扱う。
  totalIsDelta?: boolean;
  // 割合から推測する時に使う。銀行・カード会社の通知か / 既存決済の確定・更新か。
  dateIsSettlement?: boolean;
  isUpdate?: boolean;
  // 承認番号・取引ID など。**同じ取引だと分かっている時にだけ推測を許す**
  // ために見る（下の looksLikeTip）。
  referenceIds?: string[];
};

// チップとみなす割合の範囲。米国の飲食は 15〜25% が中心で、少額の会計に
// 置く定額（$9.42 に $1 ＝ 10.6%）や 10% も実データにある。上を 25% で切るのは、
// それを超える差は一部確定・一部返金の方が説明として自然になるため。
const TIP_MIN = 0.1;
const TIP_MAX = 0.25;

// a=合体先の下書き / b=新しく届いたメール / llmTotal=LLM が出した合体後の金額。
// summed は「追加ぶんを足したか」——日付をどちらから採るかにも効く
// （足したなら取引が起きたのは古い方の日。receiptDate.ts）。
export function mergedTotal(
  a: TotaledReceipt,
  b: TotaledReceipt,
  llmTotal: number,
): { total: number; summed: boolean } {
  const floor = Math.max(a.total, b.total);
  const usable = a.currency === b.currency && a.total > 0 && b.total > 0;

  // **足すのは決済通知どうしの時だけ。** 店のレシートの総額にはチップが既に
  // 含まれているので、そこに差額を足すと二重計上になる（実データ: 店の
  // レシート 35.18 に確定通知の差額 5.86 を足して 41.04 になっていた。
  // 正しくは 35.18）。
  const bothSettlement = !!a.dateIsSettlement && !!b.dateIsSettlement;

  if (usable && bothSettlement) {
    // 印がある側を主にする。片方だけが「差額」なら足す。両方が差額（同じ確定
    // 通知が2回届いた）や両方が総額（重複・更新）は足さない。
    if (!!a.totalIsDelta !== !!b.totalIsDelta) {
      return { total: a.total + b.total, summed: true };
    }
    if (!a.totalIsDelta && !b.totalIsDelta && looksLikeTip(a, b)) {
      return { total: a.total + b.total, summed: true };
    }
  }

  // 足さない時の歯止め。**合体後が元のどれよりも小さくなることはない**
  // ——調整額が元を丸ごと置き換える壊れ方が実際にあった（55.47 の会計が
  // 11.09 になった）。足すべきだったのか重複だったのかはここでは決められない
  // ので、確実に言える下限に留める。
  return { total: Math.max(llmTotal, floor), summed: false };
}

// 印が付いていない時の推測。**同じ取引だと分かっていて**、**片方だけが確定・
// 更新**で、その額が相手のチップに当たる割合なら、チップとみなす（両方が決済
// 通知であることは呼ぶ側で見ている）。
//
// **識別番号の一致を必須にする。** 合体の相手は識別番号で決まることもあれば
// 日付の近さで決まることもあり、後者は「同じ取引」とまでは言えない。承認番号は
// 「同じ取引か」には強い答えを出すが、**「その額が差額か総額か」には答えない**
// （$100 で承認して $40 で確定する発行元でも番号は一致する）。だから足す方向の
// 根拠にはせず、**推測を許す範囲を狭める方向にだけ使う**。
function looksLikeTip(a: TotaledReceipt, b: TotaledReceipt): boolean {
  if (!sharesReference(a, b)) return false;
  if (!!a.isUpdate === !!b.isUpdate) return false;
  const [base, add] = a.isUpdate ? [b, a] : [a, b];
  if (add.total >= base.total) return false;
  const ratio = add.total / base.total;
  return ratio >= TIP_MIN && ratio <= TIP_MAX;
}

function sharesReference(a: TotaledReceipt, b: TotaledReceipt): boolean {
  const A = new Set((a.referenceIds ?? []).map((x) => x.trim()).filter(Boolean));
  if (A.size === 0) return false;
  return (b.referenceIds ?? []).some((x) => A.has(x.trim()));
}
