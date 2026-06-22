// レシート抽出のプロンプト生成（純関数）。プロバイダ非依存。
// generateObject に system + prompt として渡す前提。スキーマ（receiptSchema）が
// 出力の形を縛るので、ここでは「何を読むべきか」の指示と入力本文だけを作る。

export const RECEIPT_SYSTEM_PROMPT = [
  "あなたは購入レシートのメールから費用情報を抽出するアシスタントです。",
  "メールは利用者が転送したもので、本文に『Forwarded message』として元の販売元",
  "（店舗・サービス）の情報が含まれることがあります。元の販売元を merchant とし、",
  "転送した本人の名前を merchant にしないこと。",
  // total: subtotal ではなく最終の支払総額（前ツールの教訓: Toast は Subtotal の後に Total）
  "total は実際に支払った最終総額（税・チップ・手数料込み）。途中の小計(subtotal)を",
  "拾わないこと。通貨は記号から ISO 4217 に変換する（$→USD、¥→JPY 等）。",
  // date: 支払った取引日（カード確定日でない）。serviceDate は搭乗/チェックイン日
  "date は支払った日（取引日）を YYYY-MM-DD で。カード確定日・請求日ではない。",
  "航空券の搭乗日・宿泊のチェックイン日など『実際に使う日』が購入日と別にある場合は",
  "serviceDate に YYYY-MM-DD で入れる（店頭購入など該当しなければ null）。",
  "年が無ければ文脈/受信日から補う。",
  "レシートに購入時刻が書かれていれば time に HH:MM（24時間）で（現地の壁時計の",
  "時刻をそのまま、タイムゾーン変換はしない）。時刻が無ければ null。",
  // category: 中身で判断。ブランド/会場名に釣られない（例: ホテル内レストランは飲食）
  "category は実際に購入した内容で選ぶ。施設やブランド名に釣られないこと",
  "（例: ホテル内のレストランでの飲食は『宿泊』ではなく『飲食』）。",
  "本文に添付ファイルや明細リンクから抽出したテキストが付加されている場合はそれも参照する。",
  "本文中のトラッキングURL・画像・フッターの定型文は無視する。",
  "本文がスカスカで、品目・小計などの明細が『View your receipt / 領収書を見る』のような",
  "リンク先にしかない場合は、その URL を detailUrl に入れる（本文に十分な明細があれば、",
  "または該当リンクが無ければ null。トラッキング/配信解除リンクは入れない）。",
  // マージ用（決済元非依存）
  "取引を識別する番号（承認番号・取引ID・注文番号・確認番号など、どの決済元でも）が",
  "あれば referenceId に入れる（無ければ null）。",
  "このメールが既存決済の確定・更新・差額調整の通知（pending→確定、金額更新など）なら",
  "isUpdate を true、新規の購入レシートなら false にする。",
  "読み取れない項目は無理に推測せず、不明は空文字 / null。",
  // 旅行の割り当て（候補が渡されたときだけ）
  "【旅行の割り当て】候補となる旅行（旅行名と日程）が与えられたら、このレシートが",
  "どの旅行に属するかを判断し tripId にその旅行の id を入れる。メールには複数の日付",
  "（受信日・決済/確定日・実際に利用する日）が混在しうるので、購入した時期ではなく",
  "『実際にその費用が使われる旅行』で割り当てること。例: 旅行中に予約した将来の航空券は、",
  "購入時の旅行ではなく搭乗日(利用日)の旅行に属する。店名・場所(location)・利用日を",
  "手がかりにする。どの候補にも確信が持てなければ tripId は null（無理に割り当てない）。",
  "候補が与えられなければ tripId は null。",
].join("");

// 候補旅行のヒント（id・旅行名・日程）。割り当て推論に使う。
export type TripHint = {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
};

// 件名＋本文（＋候補旅行）から、抽出対象のユーザメッセージを組み立てる。
export function buildReceiptPrompt(input: {
  subject: string;
  text: string;
  trips?: TripHint[];
}): string {
  const subject = input.subject.trim();
  const text = input.text.trim();
  const trips = input.trips ?? [];
  const tripLines = trips.length
    ? trips
        .map(
          (t) =>
            `- id=${t.id}: ${t.title}（${t.startDate ?? "?"}〜${t.endDate ?? "?"}）`,
        )
        .join("\n")
    : "(候補なし)";
  return [
    "次のレシートメールから費用情報を抽出してください。",
    "",
    `件名: ${subject || "(なし)"}`,
    "",
    "本文:",
    text,
    "",
    "候補の旅行（このレシートがどれに属するか tripId で答える。該当無し/不明は null）:",
    tripLines,
  ].join("\n");
}
