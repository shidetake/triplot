#!/usr/bin/env node
// テーブルを作る migration に、そのテーブルの grant が書いてあるかを確かめる
// （docs/database.md「Migration ポリシー」）。
//
// Supabase は 2026-10-30 から、public に新しく作ったテーブルへ権限を自動で
// 付けない。grant を書き忘れても migration は通り、画面やバックグラウンドの
// 処理で初めて "permission denied" になる。service_role にも付かないので、
// Edge Function や Cron の処理も同じように落ちる。書き忘れは当てた時点では
// 気付けないので、ここで止める。
//
// 見るのは CUTOFF より後の migration だけ。それ以前のテーブルは自動で付いた
// 権限を持っていて、適用済みのファイルは書き換えないため。
//
// 資格情報は要らない（ファイルを読むだけ）。CI でも走る。

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATIONS_DIR = path.join(root, "supabase/migrations");
const CUTOFF = "20261019000000";

// "public"."foo" / public.foo / foo → foo
const tableName = (s) => s.replace(/"/g, "").replace(/^public\./i, "").toLowerCase();

// コメントを除いてから探す（説明の中の「create table」に反応しないように）。
const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");

const IDENT = String.raw`((?:"?public"?\.)?"?[A-Za-z_][A-Za-z0-9_]*"?)`;
const CREATE_RE = new RegExp(
  String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${IDENT}`,
  "gi",
);
const GRANT_RE = new RegExp(String.raw`\bgrant\s[^;]*?\bon\s+(?:table\s+)?${IDENT}`, "gi");

const problems = [];
let checked = 0;
for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
  if (file.split("_")[0] <= CUTOFF) continue;
  checked++;
  const sql = stripComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  const created = [...sql.matchAll(CREATE_RE)].map((m) => tableName(m[1]));
  const granted = new Set([...sql.matchAll(GRANT_RE)].map((m) => tableName(m[1])));
  for (const t of created) {
    if (!granted.has(t)) problems.push(`${file}: ${t}`);
  }
}

if (problems.length) {
  console.error("check-migration-grants: テーブルを作ったのに grant が無い");
  for (const p of problems) console.error(`  ${p}`);
  console.error("  同じ migration に、使う役割の分だけ grant を書く（例）:");
  console.error("    grant select, insert, update, delete on public.<テーブル> to authenticated;");
  console.error("    grant all on public.<テーブル> to service_role;");
  process.exit(1);
}
console.log(`check-migration-grants: OK（${checked} 本）`);
