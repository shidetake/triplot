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
// 本末転倒なので、値をここに持たない（環境ファイルが無ければ何も見ずに通す）。

import { spawnSync } from "node:child_process";
import fs from "node:fs";

const ENV_FILES = ["apps/web/.env.local", ".env.local"];
// 値を持つ環境変数のうち、漏れると困るもの。名前だけをここに置く。
const SECRET_KEYS = [
  "TRIPLOT_RECEIPTS_ADDRESS",
  "SUPABASE_ACCESS_TOKEN",
  "BLOB_READ_WRITE_TOKEN",
  "SUPABASE_STAGING_DB_URL",
];

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
      if (value.length >= 12) out.set(key, value);
    }
  }
  return out;
}

const secrets = readSecrets();
if (secrets.size === 0) process.exit(0);

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
    if (content.includes(value)) hits.push({ file, key });
  }
}

if (hits.length > 0) {
  console.error("");
  console.error("コミットしようとしている中に、外に出せない値が入っている:");
  console.error("");
  for (const h of hits) {
    // **値そのものは出さない**（ログや画面に残るため）。どのファイルの
    // どの種類か、だけ言う。
    console.error(`  ${h.file}  ← ${h.key} の値`);
  }
  console.error("");
  console.error("その値は gitignore された環境ファイルにだけ置く。");
  console.error("ファイルから消してからコミットし直すこと。");
  console.error("");
  console.error(
    "（転送先アドレスは、知っていれば誰でもその受信箱にメールを流し込める）",
  );
  process.exit(1);
}
