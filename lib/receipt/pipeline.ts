import { selectReceiptLinks } from "./links";
import { mimeToText } from "./text";

// 受信レシート（生 MIME）→ 構造化データ、までのオーケストレーション。
// 本文＋PDF を集め、許可ドメインに一致する明細リンクがあれば fetchLink で取得して
// 本文に足し、最後に1回だけ抽出する。fetchLink はサーバ側の fetchReceiptLink を注入
// （[[fetchLink.ts]]）。テストやリンク不要な経路では省略できる。

// URL → テキスト（取得不可なら null）。
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
