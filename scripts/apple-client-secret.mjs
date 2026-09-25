#!/usr/bin/env node
// web の「Apple でログイン」に使う client secret（JWT）を作る。
//
// Apple の仕様で、この JWT の有効期限は最長6か月。切れると web の Apple
// ログインが黙って失敗する（Supabase が Apple との照合に失敗する。iOS は
// 端末の Apple ログインを使うので影響を受けない）。docs/architecture.md の
// 「人手の定期メンテナンス」参照。
//
// 使い方:
//   node scripts/apple-client-secret.mjs --p8 ~/Downloads/AuthKey_XXXXXXXXXX.p8 \
//     --key-id XXXXXXXXXX --team-id XXXXXXXXXX
//
// 出てきた JWT を Supabase Dashboard（Authentication → Providers → Apple →
// Secret Key）に貼る。本番と staging でプロジェクトが別なので、使う方に貼る。
//
// 秘密鍵（.p8）はこの Mac の中で読むだけで、どこにも送らない。
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

// web の Services ID（Supabase の Apple の Client IDs の先頭）。
const DEFAULT_SERVICES_ID = "app.triplot.web";
// Apple の上限は 15777000 秒（約6か月）。上限ちょうどにする。
const MAX_SECONDS = 15777000;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const p8Path = arg("p8");
const keyId = arg("key-id");
const teamId = arg("team-id");
const servicesId = arg("services-id") ?? DEFAULT_SERVICES_ID;

if (!p8Path || !keyId || !teamId) {
  console.error(
    "使い方: node scripts/apple-client-secret.mjs --p8 <AuthKey_XXXX.p8> --key-id <Key ID> --team-id <Team ID> [--services-id app.triplot.web]",
  );
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

const now = Math.floor(Date.now() / 1000);
const exp = now + MAX_SECONDS;
const header = { alg: "ES256", kid: keyId, typ: "JWT" };
const payload = {
  iss: teamId,
  iat: now,
  exp,
  aud: "https://appleid.apple.com",
  sub: servicesId,
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const key = createPrivateKey(readFileSync(p8Path.replace(/^~/, homedir())));
// JWT の ES256 は r||s の固定長（ieee-p1363）で署名する（DER ではない）。
const signature = sign("sha256", Buffer.from(signingInput), {
  key,
  dsaEncoding: "ieee-p1363",
});

console.log(`${signingInput}.${b64url(signature)}`);
console.error(
  `\n有効期限: ${new Date(exp * 1000).toISOString().slice(0, 10)}（この日までに作り直す）`,
);
