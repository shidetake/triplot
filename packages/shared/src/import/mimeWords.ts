// メールヘッダの MIME encoded-word（RFC 2047）を解く。
//
// 非 ASCII を含む Subject は `=?UTF-8?Q?Fwd=3A_Thanks?=` のような形で来る。
// 転送元やメールサーバによっては既に解かれた文字列で届くが、生のまま届く
// ことがあり、そのまま保存すると受信箱にこの文字列が並ぶ（実際に起きた）。
//
// 標準ライブラリに無いので最小限を自前で持つ。ここは取り込みの入口
// （webhook）でしか使わないが、純関数なので shared に置いてテストする。

// =?charset?encoding?text?=
const WORD = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;

const B64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// base64 → バイト列。atob / Buffer は環境によって有無が違う（shared は RN
// からも読まれる）ので、環境に依存しない実装を持つ。
function base64Bytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((clean[i + 2] ? B64.indexOf(clean[i + 2]) : 0) << 6) |
      (clean[i + 3] ? B64.indexOf(clean[i + 3]) : 0);
    out.push((n >> 16) & 0xff);
    if (clean[i + 2]) out.push((n >> 8) & 0xff);
    if (clean[i + 3]) out.push(n & 0xff);
  }
  return Uint8Array.from(out);
}

// Q encoding（quoted-printable の変種）。`_` は空白、`=XX` は16進バイト。
function qBytes(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "_") {
      out.push(0x20);
    } else if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(c.charCodeAt(0) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function decodeWord(
  original: string,
  charset: string,
  encoding: string,
  text: string,
): string {
  try {
    // charset には RFC 2231 の言語タグが付くことがある（UTF-8*ja）。
    const cs = charset.split("*")[0];
    const bytes =
      encoding.toUpperCase() === "B" ? base64Bytes(text) : qBytes(text);
    return new TextDecoder(cs).decode(bytes);
  } catch {
    // 未知の charset・壊れた encoded-word は、元の文字列のまま残す
    // （解けないものを空にすると件名が消えて何のメールか分からなくなる）。
    return original;
  }
}

export function decodeMimeWords(input: string | null): string | null {
  if (!input || !input.includes("=?")) return input;
  let out = "";
  let last = 0;
  let seen = false;
  for (const m of input.matchAll(WORD)) {
    const start = m.index ?? 0;
    const between = input.slice(last, start);
    // 隣り合う encoded-word の間の空白は区切りであって中身ではない（RFC 2047）。
    // 落とさないと "こんにちは 世界" のように余計な空白が入る。
    if (!(seen && between.length > 0 && between.trim() === "")) out += between;
    out += decodeWord(m[0], m[1], m[2], m[3]);
    last = start + m[0].length;
    seen = true;
  }
  return out + input.slice(last);
}
