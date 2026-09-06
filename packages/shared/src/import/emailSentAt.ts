// 転送されてきたメールから「元のメールが送られた瞬間」を取り出す（純関数・前処理）。
//
// 銀行・カード会社の決済通知には日付しか書かれていないことが多く（ソニー銀行の
// 「カード利用日：2026年4月29日」等）、しかもその日付は**発行元の国の暦**で
// 書かれている。海外で使うと現地の日付と1日ずれる。ずれを直すには「いつ」を
// 絶対時刻で知る必要があり、その一番確かな手がかりが**通知メール自身の送信時刻**
// になる（利用ごとに送ってくる通知は実測でほぼ即時。settlementTiming.ts 参照）。
//
// **受信時刻（inbound_emails.received_at）は使えない。** 転送されて届くので、
// それは「ユーザーが転送した時刻」であって元のメールの時刻ではない（実測: 4月の
// 通知を9月に転送していて4か月ずれる）。元の時刻は転送本文の先頭に付く
// 「転送されたメッセージ」のヘッダーに残っているので、そこから読む。
//
// **オフセットを持たない表記は採らない。** Gmail が手動転送で書く日付は
// 「2026年4月29日(水) 11:38」のように転送した人のタイムゾーンで描画されていて、
// どのタイムゾーンなのかが文字列に無い。読めたつもりで別の瞬間を作るより、
// 分からない（null）を返して呼び出し側に諦めさせる方が安全。

// 転送ブロックの始まり。Gmail（日英）・Apple Mail・Outlook の表記。
const FORWARD_MARKERS = [
  "Forwarded message",
  "転送されたメッセージ",
  "Begin forwarded message",
  "Original Message",
  "元のメッセージ",
];

// 転送ブロックのヘッダーは冒頭数行に収まる。行数ではなく文字数で窓を切る
// （HTML から起こした本文は改行の入り方が違うため）。
const HEADER_WINDOW = 600;

const DATE_LINE_RE = /^[ \t>]*(?:Date|Sent|送信日時|日付)[ \t]*[:：][ \t]*(.+)$/im;

// 明示的なオフセットを持つ日時表記だけを受け付ける（時刻の直後にゾーンが付く形）。
//   ISO 8601:   2026-04-29T02:38:23.000Z / 2026-04-29T11:38:23+09:00
//   RFC 5322:   Wed, 29 Apr 2026 11:38:23 +0900 / ... GMT
const HAS_OFFSET_RE =
  /\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:Z|[+-]\d{2}:?\d{2}|UTC|UT|GMT)$/i;

function parseInstant(s: string): string | null {
  const t = s.trim().replace(/\s*\([^)]*\)\s*$/, ""); // 末尾の "(JST)" 等の註記
  if (!HAS_OFFSET_RE.test(t)) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * 元のメールの送信時刻（ISO 文字列）。分からなければ null。
 *
 * `headerDate` は届いたメール自身の Date ヘッダー（postal-mime の `date`）。
 * 転送ブロックが見つかればそちらを優先する — 転送メールの Date ヘッダーは
 * 転送した時刻だから。
 */
export function emailSentAt(
  headerDate: string | null | undefined,
  bodyText: string,
): string | null {
  const at = FORWARD_MARKERS.map((m) => bodyText.indexOf(m)).filter(
    (i) => i >= 0,
  );
  if (at.length > 0) {
    const from = Math.min(...at);
    const m = bodyText.slice(from, from + HEADER_WINDOW).match(DATE_LINE_RE);
    const forwarded = m ? parseInstant(m[1]) : null;
    if (forwarded) return forwarded;
    // 転送だと分かっていて元の時刻が読めないなら、自分の Date ヘッダーは
    // 転送時刻なので使わない。
    return null;
  }
  return headerDate ? parseInstant(headerDate) : null;
}
