// サーバー側のコードが "use client" モジュールの**値**を呼んでいないか検査する。
//
// ■ なぜ要るか
//   Next.js では、"use client" のモジュールから export された関数は、サーバー
//   コンポーネントから見ると実体ではなく参照になる。呼ぶと実行時に
//
//     Attempted to call foo() from the server but foo is on the client.
//
//   で 500 になる。**型チェックも lint もテストも素通りする**（型の上では
//   ただの関数なので）。Next.js が教えてくれるのは実行時だけ。
//
//   実際に踏んだ: 旅行詳細ページ（サーバー）が event-form.tsx（"use client"）の
//   toEventFormPrefill を呼んでいた。「予定の下書きがある旅行を開いた時」しか
//   通らない経路だったため、9日間潜伏してから本番で顕在化した。この検査は
//   その形の再発を push 前に止める。
//
// ■ 何を見て何を見ないか
//   静的な import 文だけを見る（動的 import は対象外）。JSX として描画する
//   だけの import は正常なパターンなので通す。`import type` は erase される
//   ので安全、これも通す。
//
//   「JSX でも呼び出しでもない」参照は落とさず報告に留める。クライアント
//   コンポーネントを props として別のクライアントコンポーネントに渡すのは
//   正当なので、ここを fail にすると誤検知で push を止めてしまう。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith("."))
      continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const files = walk(WEB);
const isClient = new Map(
  files.map((f) => [
    f,
    /^\s*["']use client["']/m.test(readFileSync(f, "utf8").slice(0, 200)),
  ]),
);

// "@/x" と相対パスだけ解決する（パッケージ import は対象外）。
function resolveSpec(spec, from) {
  let base;
  if (spec.startsWith("@/")) base = join(WEB, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return existsSync(base) && statSync(base).isFile() ? base : null;
}

const called = [];
const unclear = [];

for (const f of files) {
  if (isClient.get(f)) continue; // サーバー側（"use client" が無い）だけ検査する
  const src = readFileSync(f, "utf8");
  const re =
    /import\s+(type\s+)?(\{[^}]*\}|[A-Za-z0-9_$]+)\s+from\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const [, typeOnly, clause, spec] = m;
    if (typeOnly) continue;
    const target = resolveSpec(spec, f);
    if (!target || !isClient.get(target)) continue;

    const names = clause.startsWith("{")
      ? clause
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith("type "))
          .map((s) => (s.includes(" as ") ? s.split(" as ")[1].trim() : s))
      : [clause.trim()];

    const body = src.slice(m.index + m[0].length);
    for (const n of names) {
      const where = { file: f.replace(WEB + "/", ""), name: n, spec };
      if (new RegExp(`(?<![.\\w])${n}\\s*\\(`).test(body)) called.push(where);
      else if (!new RegExp(`<${n}[\\s/>]`).test(body)) unclear.push(where);
    }
  }
}

if (unclear.length > 0) {
  console.warn(
    "check-client-boundary: JSX でも呼び出しでもない参照（props 渡しなら正常）:",
  );
  for (const x of unclear)
    console.warn(`  ${x.file} → ${x.name} (${x.spec})`);
}

if (called.length > 0) {
  console.error(
    'check-client-boundary: サーバー側から "use client" の関数を呼んでいます。',
  );
  console.error(
    "実行時に 500 になります。純粋な関数ならクライアント境界の外へ移してください。",
  );
  for (const x of called) console.error(`  ${x.file} → ${x.name}() (${x.spec})`);
  process.exit(1);
}

console.log("check-client-boundary: OK");
