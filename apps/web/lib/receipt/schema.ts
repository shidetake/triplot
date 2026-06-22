import { z } from "zod";

// レシートメールから LLM で抽出する構造化データの契約（Zod スキーマ）。
// プロバイダ非依存：AI SDK の generateObject にこのスキーマを渡し、Claude /
// Gemini / OpenAI / ローカル のどれでも同じ型で受け取る。
//
// category は trip ごとの expense_categories（既定の 11 個）に合わせた正規名で
// LLM に選ばせ、後段（取り込み確定時）でその trip の category_id に名前で対応づける。
// 既定カテゴリ: seed_default_expense_categories と一致させること。

export const RECEIPT_CATEGORIES = [
  "渡航",
  "現地移動",
  "飲食",
  "衣服",
  "エンタメ",
  "土産",
  "宿泊",
  "通信",
  "医療",
  "カジノ",
  "その他",
] as const;

export const receiptSchema = z.object({
  merchant: z
    .string()
    .describe("店舗・サービス名。例: Uber / KAI COFFEE ALOHILANI。不明なら空文字"),
  total: z
    .number()
    .describe("合計（支払）金額の数値のみ。通貨記号・桁区切りは含めない"),
  currency: z
    .string()
    .describe("ISO 4217 の通貨コード（大文字3字）。例: $ → USD、¥ → JPY"),
  date: z
    .string()
    .describe(
      "支払った日（取引日）。YYYY-MM-DD。店頭購入では利用日と同じ。カード確定日・請求日ではない。年が無ければ文脈/受信年で補う",
    ),
  serviceDate: z
    .string()
    .nullable()
    .describe(
      "航空券の搭乗日・宿泊のチェックイン日など、購入日と別に『実際に使う日』がある場合のみ YYYY-MM-DD。店頭購入など該当しなければ null",
    ),
  time: z
    .string()
    .nullable()
    .describe(
      "レシートに購入時刻が記載されていれば HH:MM（24時間）。現地の壁時計の時刻をそのまま。不明なら null",
    ),
  category: z
    .enum(RECEIPT_CATEGORIES)
    .describe("最も近いカテゴリを1つ。判断できなければ「その他」"),
  location: z
    .string()
    .nullable()
    .describe("店舗の住所・地名（場所の手がかり）。無ければ null"),
  // マージ用（決済元を問わない汎用フィールド）。
  referenceId: z
    .string()
    .nullable()
    .describe(
      "取引を識別する番号があれば（承認番号・取引ID・注文番号・確認番号など、決済元・カード会社・サービスを問わない）。無ければ null",
    ),
  isUpdate: z
    .boolean()
    .describe(
      "このメールが既存決済の確定・更新・差額調整の通知（pending→確定、金額の更新/調整など）なら true。新規の購入レシートなら false",
    ),
});

export type Receipt = z.infer<typeof receiptSchema>;
