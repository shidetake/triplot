#!/usr/bin/env node
// Cloudflare の Worker（workers/ の下）を出す。
//
//   npm run workers:deploy -- inbound-email
//   npm run workers:deploy -- retry-heartbeat
//   npm run workers:deploy -- inbound-email --dry-run   # 送らずに、何が出るかだけ見る
//
// 設定（名前・平文の変数・cron）は各 Worker の wrangler.jsonc が原本。ダッシュボードで
// 足した平文の変数は、ここに書いていなければ出した時に消える。秘密の値は Cloudflare 側に
// だけあり、出しても消えない。初回は `npx wrangler login` が要る。
//
// wrangler は依存関係に入れず、版を固定して npx で呼ぶ（入れると Vercel のビルドの
// たびに使わない実行環境まで落としてくる）。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WRANGLER = "wrangler@4.151.2";

const [name, ...rest] = process.argv.slice(2);
const KNOWN = ["--dry-run"];
const unknown = rest.filter((a) => !KNOWN.includes(a));
const config = name && path.join("workers", name, "wrangler.jsonc");
if (!config || !fs.existsSync(config) || unknown.length > 0) {
  const names = fs
    .readdirSync("workers")
    .filter((d) => fs.existsSync(path.join("workers", d, "wrangler.jsonc")));
  console.error(
    `使い方: npm run workers:deploy -- <${names.join("|")}> [--dry-run]`,
  );
  process.exit(1);
}

const r = spawnSync(
  "npx",
  ["-y", WRANGLER, "deploy", "--config", config, ...rest],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
