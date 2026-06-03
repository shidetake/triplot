import PostalMime from "postal-mime";

// 受信レシートメール → LLM に渡すプレーンテキストへの前処理。
// MIME パース（postal-mime）は副作用寄りなので薄く包み、HTML→テキスト整形は
// 純関数に分けてテストする。

// HTML をプレーンテキストへ。タグ除去・主要ブロックで改行・空白圧縮。
// 完全な HTML パーサではない（LLM 入力用の軽量整形）。
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 生 MIME → { subject, text }。text/plain を優先し、無ければ html を整形する。
export async function mimeToText(
  raw: string | Uint8Array,
): Promise<{ subject: string; text: string }> {
  const email = await PostalMime.parse(raw);
  const plain = email.text?.trim();
  const text = plain && plain.length > 0 ? plain : htmlToText(email.html ?? "");
  return { subject: email.subject ?? "", text };
}
