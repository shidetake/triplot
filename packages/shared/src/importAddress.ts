// per-user 取り込みアドレスの組み立てと宛先パース（純関数・web/RN 共用）。
// 方針（合意済み・M3）: アドレスはユーザごとに固定の `receipts+<token>@triplot.app`。
// 宛先のトークンで本人を特定する（From に依存しない＝Apple 中継メールでも確実）。
// token は小文字 base36（RPC で lower(nanoid) 生成）なので大小文字事故を避けられる。

export const IMPORT_LOCALPART = "receipts";
export const IMPORT_DOMAIN = "triplot.app";

export function buildImportAddress(token: string): string {
  return `${IMPORT_LOCALPART}+${token}@${IMPORT_DOMAIN}`;
}

// 受信宛先（"receipts+abc123@triplot.app" / "<...>" / "Name <...>" 形）から token を取り出す。
export function parseImportToken(recipient: string): string | null {
  const angle = recipient.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : recipient).trim().toLowerCase();
  const at = addr.indexOf("@");
  if (at < 0) return null;
  const local = addr.slice(0, at);
  const prefix = `${IMPORT_LOCALPART}+`;
  if (!local.startsWith(prefix)) return null;
  const token = local.slice(prefix.length);
  // lower base36 のみ・妥当な長さ
  if (!/^[0-9a-z]{4,32}$/.test(token)) return null;
  return token;
}
