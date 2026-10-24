#!/usr/bin/env node
// コミットしようとしている中身に、**外に出してはいけない値**が混ざっていないか見る。
//
// いま見ているのは取り込みの転送先アドレス。**知っていれば誰でもその受信箱に
// メールを流し込める**ので、コミットする物には書かない決まりになっている
// （置き場所は gitignore された apps/web/.env.local）。
//
// 決まりを文書に書くだけだと、思い出した時にしか守られない。ここで止めれば、
// 忘れても素通りしない。
//
// 探す値は**環境ファイルから読む**。この判定器自体に秘密を書いてしまっては
// 本末転倒なので、値をここに持たない（環境ファイルが無ければ値では探さない）。
//
// もう1つ、**値を知らなくても形で分かる鍵**は形で探す。Google の API キーは
// 環境ファイルではなく EAS に置いてあり、値では探せない。実際、iOS のビルドが
// 記録に書き出した地図のキーが、記録ごと無関係なコミットに紛れて公開された
// （build-logs/ を gitignore し忘れていた）。どこに紛れても形で止める。

import { spawnSync } from "node:child_process";
import fs from "node:fs";

const ENV_FILES = [
  "apps/web/.env.local",
  "apps/web/.env.staging.local",
  ".env.local",
];
// 値を持つ環境変数のうち、漏れると困るもの。名前だけをここに置く。
const SECRET_KEYS = [
  "TRIPLOT_RECEIPTS_ADDRESS",
  "TRIPLOT_PROD_RECEIPTS_ADDRESS",
  "SUPABASE_ACCESS_TOKEN",
  "BLOB_READ_WRITE_TOKEN",
];
// 形で分かる鍵。名前は見つけた時の知らせに使う。
const SECRET_PATTERNS = [
  { name: "Google の API キー", re: /AIza[0-9A-Za-z_-]{35}/ },
];

// 同じ名前が複数のファイルにある（SUPABASE_ACCESS_TOKEN は本番用が .env.local、
// staging 用が .env.staging.local）ので、名前ではなく「ファイル + 名前」で持つ。
// 名前で持つと後のファイルが前の値を上書きし、片方を見なくなる。
function readSecrets() {
  const out = new Map();
  for (const f of ENV_FILES) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const [, key, raw] = m;
      if (!SECRET_KEYS.includes(key)) continue;
      const value = raw.trim().replace(/^["']|["']$/g, "");
      // 短すぎる値は誤検知の元（空・プレースホルダ）。
      if (value.length >= 12) out.set(`${f} の ${key}`, value);
    }
  }
  return out;
}

const secrets = readSecrets();

// staged の中身だけを見る（作業ツリーの実験は止めない）。
const staged = spawnSync("git", ["diff", "--cached", "--name-only", "-z"], {
  encoding: "utf8",
});
const files = staged.stdout.split("\0").filter(Boolean);

const hits = [];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  // バイナリと巨大ファイルは飛ばす。
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 2_000_000) continue;
  const content = spawnSync("git", ["show", `:${file}`], {
    encoding: "utf8",
    maxBuffer: 8_000_000,
  }).stdout;
  if (!content || content.includes("\0")) continue;
  for (const [key, value] of secrets) {
    if (content.includes(value)) hits.push({ file, key: `${key} の値` });
  }
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(content)) hits.push({ file, key: name });
  }
}

if (hits.length > 0) {
  console.error("");
  console.error("コミットしようとしている中に、外に出せない値が入っている:");
  console.error("");
  for (const h of hits) {
    // **値そのものは出さない**（ログや画面に残るため）。どのファイルの
    // どの種類か、だけ言う。
    console.error(`  ${h.file}  ← ${h.key}`);
  }
  console.error("");
  console.error("その値は gitignore された環境ファイル（Google のキーは EAS）にだけ置く。");
  console.error("ファイルから消してからコミットし直すこと。");
  console.error("ビルドの記録などの出力なら、置き場所を gitignore に足す。");
  console.error("");
  console.error(
    "（転送先アドレスは、知っていれば誰でもその受信箱にメールを流し込める）",
  );
  process.exit(1);
}
