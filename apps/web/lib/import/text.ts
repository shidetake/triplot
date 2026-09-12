import PostalMime from "postal-mime";
import { extractText } from "unpdf";

import { emailSentAt } from "@triplot/shared/import/emailSentAt";

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

// URL の**末尾だけ**を落とす。頭は残す。
//
// 実測（本番100通）: 本文の平均3,507字のうち **60%が URL**で、1通あたり平均12本、
// うち4本が200字を超える。追跡用のクエリ（utm・署名・エンコードした宛先）が
// 長さの正体で、プロンプトでも「トラッキングURLは無視する」と言っている ——
// つまり**無視させるためにトークンを払っていた**。
//
// **消さずに削る。** URL を丸ごと落とすと、明細リンクを辿る機能（detailUrl）と
// 配信停止リンクの判定が両方効かなくなる。どちらもホストとパスの頭で判断して
// いるので、先頭を残せば判断は変わらない。detailUrl は「本文に実在する URL のみ
// 採用」と照合するので、**この刈り込みを通した本文を LLM に渡す限り一致する**
// （照合する側も同じ文字列を見る）。
//
// 120字にしたのは、実データのレシートリンク（Toast/Square/Clover 等）がホスト＋
// ID で 120字以内に収まるため。これで平均3,507字 → 2,366字（33%減）。
const URL_KEEP_CHARS = 120;

const LONG_URL_RE = new RegExp(
  `(https?://\\S{${URL_KEEP_CHARS}})\\S+`,
  "g",
);

export function trimLongUrls(text: string): string {
  // 末尾は「…」に置き換える。切ったことが本文から分かる方が、LLM が途中で
  // 切れた URL を完全な URL だと思って detailUrl に入れるのを防げる。
  return text.replace(LONG_URL_RE, "$1…");
}


// 生 MIME → { subject, text }。中身のある方（下記 pickBodyText）を本文にする。
// 添付の PDF（航空券・ホテル folio 等、金額が本文でなく添付にあるもの）は
// テキスト化して本文末尾に付加し、LLM が読めるようにする。
export type BodyChoice = {
  plain: number;
  html: number;
  used: "plain" | "html";
};

export async function mimeToText(
  raw: string | Uint8Array,
): Promise<{
  subject: string;
  text: string;
  choice: BodyChoice;
  sentAt: string | null;
}> {
  const email = await PostalMime.parse(raw);
  const plain = email.text?.trim() ?? "";
  const htmlText = htmlToText(email.html ?? "");
  // どちらを本文に選んだかは、**刈り込む前**に決めておく（下の used の判定で
  // 刈り込み後の文字列と比べると、URL を削ったぶん plain と一致しなくなり
  // 常に "html" と記録されてしまう）。
  const picked = pickBodyText(plain, htmlText);
  const used = picked === plain ? "plain" : "html";
  // 長い追跡 URL の末尾を落としてから本文にする（trimLongUrls 参照）。
  // **ここで1度だけ通す。** 本文はこの後、抽出にも・マージの候補本文にも・
  // body_text の保存にも同じものが使われるので、入口で削れば全部に効く。
  let text = trimLongUrls(picked);
  // どちらを本文に選んだかを残す。**長さと選択だけで、本文は出さない**
  // （AI を呼ぶ前なのでトークンも増えない）。
  // 「HTML だけのメールで本文を取りこぼす」不具合を追った時、選択の記録が
  // 無いせいで原因の特定に時間がかかった。同じ形が再発したらここだけ見れば済む。
  console.log(
    "[import] body",
    JSON.stringify({
      subject: email.subject ?? "",
      plain: plain.length,
      html: htmlText.length,
      used,
    }),
  );

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

  return {
    subject: email.subject ?? "",
    text,
    choice: {
      plain: plain.length,
      html: htmlText.length,
      used,
    },
    // 元のメールが送られた瞬間（転送ブロックのヘッダー優先）。決済通知の日付を
    // 現地の壁時計に直すのに使う（emailSentAt / settlementTiming 参照）。
    // 添付 PDF を足す前の本文で探す — 転送ヘッダーは必ず本文の側にある。
    sentAt: emailSentAt(email.date, text),
  };
}
