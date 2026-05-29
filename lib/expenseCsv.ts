// 費用一覧 → CSV を生成する純粋関数。名前解決（カテゴリ/メンバー/場所）は
// 呼び出し側で済ませた行を受け取り、ここは整形だけ担う。

export type ExpenseCsvRow = {
  date: string; // YYYY-MM-DD
  category: string;
  payer: string;
  localAmount: number;
  localCurrency: string;
  defaultAmount: number; // 精算通貨換算済み
  defaultCurrency: string;
  splittable: boolean;
  visibility: "shared" | "private";
  place: string;
  note: string;
};

const HEADERS = [
  "日付",
  "カテゴリ",
  "支払者",
  "金額(現地)",
  "現地通貨",
  "金額(精算)",
  "精算通貨",
  "種別",
  "公開範囲",
  "場所",
  "メモ",
];

// RFC 4180: カンマ・ダブルクォート・改行を含むセルは "" で囲み、内部の " は "" に。
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildExpensesCsv(rows: ExpenseCsvRow[]): string {
  const lines = [HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.category,
        r.payer,
        r.localAmount,
        r.localCurrency,
        r.defaultAmount,
        r.defaultCurrency,
        r.splittable ? "割り勘" : "個人",
        r.visibility === "shared" ? "共有" : "プライベート",
        r.place,
        r.note,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // Excel が UTF-8 を文字化けせず開けるよう BOM 付き、改行は CRLF。
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
