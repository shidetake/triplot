import PostalMime from "postal-mime";
import { extractText } from "unpdf";

// 受信レシートメール → LLM に渡すプレーンテキストへの前処理。
// MIME パース（postal-mime）は副作用寄りなので薄く包み、HTML→テキスト整形は
// 純関数に分けてテストする。

// HTML をプレーンテキストへ。タグ除去・主要ブロックで改行・空白圧縮。
// 完全な HTML パーサではない（LLM 入力用の軽量整形）。
export function htmlToText(html: string): string {
  return (
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      // リンクは「文字 (URL)」の形で残す。タグごと落とすと URL が消え、明細リンクを
      // 辿る機能が HTML メールで一切働かなくなる。文字と URL が隣り合うので、
      // 配信停止リンクかどうかの判断材料も増える。
      .replace(
        /<a\b[^>]*\bhref=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_m, href: string, inner: string) => {
          const label = inner
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (!label) return ` ${href} `;
          // 文字がその URL 自身なら二度書かない。
          if (label.includes(href)) return ` ${label} `;
          return ` ${label} (${href}) `;
        },
      )
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
      .trim()
  );
}

// PDF（Uint8Array）→ テキスト。unpdf は Node / ブラウザ / Worker で動く。
async function pdfToText(data: Uint8Array): Promise<string> {
  const { text } = await extractText(data, { mergePages: true });
  return text;
}

// プレーンテキストと HTML のどちらを本文として使うか。
//
// **同じ内容なら短いプレーンテキストを使う**（AI に渡す量が少なくて済み、URL も
// そのまま書かれている）。ただし本義は「中身が入っている方を使う」こと。
//
// 転送メールには、元が HTML だけのとき**転送ヘッダーだけの張りぼて**が
// プレーンテキストとして入ることがある。それを掴むと本文を丸ごと見落とす
// （実測: 手元の100通のうち32通が HTML のみ。転送すると 217〜236 文字の
// 張りぼてになり、中身は HTML 側だけに残る）。
//
// **しきい値は実測から決める。** まともなメールの「プレーン ÷ HTML由来テキスト」は
// 最小 0.32（中央 0.45）、張りぼては 0.03。間を取って 0.2 未満なら HTML を使う。
export function pickBodyText(plain: string, htmlText: string): string {
  if (!plain) return htmlText;
  if (!htmlText) return plain;
  return plain.length < htmlText.length * 0.2 ? htmlText : plain;
}

// 生 MIME → { subject, text }。中身のある方（下記 pickBodyText）を本文にする。
// 添付の PDF（航空券・ホテル folio 等、金額が本文でなく添付にあるもの）は
// テキスト化して本文末尾に付加し、LLM が読めるようにする。
export async function mimeToText(
  raw: string | Uint8Array,
): Promise<{ subject: string; text: string }> {
  const email = await PostalMime.parse(raw);
  const plain = email.text?.trim() ?? "";
  let text = pickBodyText(plain, htmlToText(email.html ?? ""));

  for (const att of email.attachments ?? []) {
    if (att.mimeType !== "application/pdf" || typeof att.content === "string") {
      continue;
    }
    try {
      const pdfText = (await pdfToText(new Uint8Array(att.content))).trim();
      if (pdfText) {
        text += `\n\n--- 添付PDF: ${att.filename ?? "attachment.pdf"} ---\n${pdfText}`;
      }
    } catch {
      // 読めない PDF は無視（本文だけで続行）
    }
  }

  return { subject: email.subject ?? "", text };
}
