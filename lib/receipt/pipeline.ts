import { selectReceiptLinks } from "./links";
import { mimeToText } from "./text";

// 受信レシート（生 MIME）→ 構造化データ、までのオーケストレーション。
// 方針（合意済み）: ライブ経路はルールのみ。本文＋PDF を集め、ルール（許可ドメイン）に
// 一致する明細リンクがあれば fetchLink で取得して本文に足し、最後に1回だけ抽出する。
// fetchLink はブラウザでは /api/fetch-link を呼ぶ関数を注入（CORS 回避）。テストや
// リンク不要な経路では省略できる。

// URL → テキスト（取得不可なら null）。ブラウザ側で /api/fetch-link を呼ぶ想定。
export type FetchLink = (url: string) => Promise<string | null>;

export type GatherOptions = {
  fetchLink?: FetchLink;
  maxLinks?: number; // 取得するリンク数の上限（コスト/レイテンシ制限）
};

// 抽出に渡す { subject, text } を組み立てる（リンク enrichment 込み）。
// LLM を呼ばないのでテスト可能（fetchLink はモックできる）。
export async function gatherReceiptText(
  raw: string | Uint8Array,
  opts: GatherOptions = {},
): Promise<{ subject: string; text: string }> {
  const { subject, text } = await mimeToText(raw);
  if (!opts.fetchLink) return { subject, text };

  const links = selectReceiptLinks(text).slice(0, opts.maxLinks ?? 2);
  let enriched = text;
  for (const url of links) {
    try {
      const linkText = await opts.fetchLink(url);
      if (linkText && linkText.trim()) {
        enriched += `\n\n--- リンク先(${url}) ---\n${linkText.trim()}`;
      }
    } catch {
      // 取得失敗は無視して本文だけで続行
    }
  }
  return { subject, text: enriched };
}
