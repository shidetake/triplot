// per-user 取り込みアドレスの組み立てと宛先パース（純関数・web/RN 共用）。
// 方針（合意済み・M3）: アドレスはユーザごとに固定の `receipts+<token>@triplot.app`。
// 宛先のトークンで本人を特定する（From に依存しない＝Apple 中継メールでも確実）。
// token は小文字 base36（RPC で lower(nanoid) 生成）なので大小文字事故を避けられる。
//
// staging の利用者には `receipts-staging+<token>@triplot.app` を見せる。受信は
// どちらも同じ Cloudflare Email Worker が受け、ローカルパートで本番と staging の
// 受け口に振り分ける（workers/inbound-email/index.js。接頭辞はそちらと揃える）。
// どちらを見せるかは、アプリが繋いでいる Supabase で決める。環境ごとの設定を
// 別に持つと、見せたアドレスと繋いでいる DB がずれうるため。

export const IMPORT_LOCALPART = "receipts";
export const STAGING_IMPORT_LOCALPART = "receipts-staging";
export const IMPORT_DOMAIN = "triplot.app";

// staging の Supabase プロジェクト（docs/development.md の環境の対応表）。
const STAGING_SUPABASE_HOST = "xuytnpkvmiduffigimol.supabase.co";

export function importLocalpartFor(supabaseUrl: string | undefined): string {
  return supabaseUrl?.includes(STAGING_SUPABASE_HOST)
    ? STAGING_IMPORT_LOCALPART
    : IMPORT_LOCALPART;
}

export function buildImportAddress(
  token: string,
  supabaseUrl: string | undefined,
): string {
  return `${importLocalpartFor(supabaseUrl)}+${token}@${IMPORT_DOMAIN}`;
}

// 受信宛先（"receipts+abc123@triplot.app" / "<...>" / "Name <...>" 形）から token を取り出す。
// 本番・staging どちらのローカルパートも受ける（どちらの受け口に届くかは Worker が決めて
// いて、届いた先の DB に無いトークンは本人不明として扱われるだけ）。
export function parseImportToken(recipient: string): string | null {
  const angle = recipient.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : recipient).trim().toLowerCase();
  const at = addr.indexOf("@");
  if (at < 0) return null;
  const local = addr.slice(0, at);
  const prefix = [STAGING_IMPORT_LOCALPART, IMPORT_LOCALPART]
    .map((p) => `${p}+`)
    .find((p) => local.startsWith(p));
  if (!prefix) return null;
  const token = local.slice(prefix.length);
  // lower base36 のみ・妥当な長さ
  if (!/^[0-9a-z]{4,32}$/.test(token)) return null;
  return token;
}
