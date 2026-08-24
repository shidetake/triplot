import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DB } from "../src/data/client";

// 実 DB テストの接続。**staging 専用**。本番の資格情報を渡しても動くが、
// 本番では絶対に走らせないこと（このテストは旅行を作って消す）。
// 資格情報は gitignore された apps/web/.env.development.local から読む
// （web の開発用ログインと同じもの＝staging を向いている）。

const ENV_FILE = "apps/web/.env.development.local";

// 本番の project ref。取り違えて本番に繋いだら止める。
const PRODUCTION_REF = "cjkiglocsrtnohoxcnfh";

function loadEnv(): Record<string, string> {
  const root = join(import.meta.dirname, "../../..");
  let text: string;
  try {
    text = readFileSync(join(root, ENV_FILE), "utf8");
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export type DbTestEnv = {
  url: string;
  anonKey: string;
  email: string;
  password: string;
};

// 資格情報が揃っていなければ null（呼び出し側が skip する）。
export function dbTestEnv(): DbTestEnv | null {
  const e = loadEnv();
  const url = e.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = e.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = e.NEXT_PUBLIC_DEV_LOGIN_EMAIL;
  const password = e.NEXT_PUBLIC_DEV_LOGIN_PASSWORD;
  if (!url || !anonKey || !email || !password) return null;
  if (url.includes(PRODUCTION_REF)) {
    throw new Error(
      `${ENV_FILE} が本番を向いている。実 DB テストは staging でしか走らせない。`,
    );
  }
  return { url, anonKey, email, password };
}

export async function signIn(
  env: DbTestEnv,
): Promise<{ sb: DB; userId: string }> {
  const client: SupabaseClient = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: env.email,
    password: env.password,
  });
  if (error || !data.user) {
    throw new Error(`開発用ログインに失敗: ${error?.message ?? "no user"}`);
  }
  return { sb: client as unknown as DB, userId: data.user.id };
}

// このテストが作る旅行の名前の接頭辞。**掃除の範囲をこれだけに限る**
// （staging はプレビュー確認にも使う場所なので、truncate やユーザー単位の
// 削除は絶対にしない）。落ちて後始末できなかった残骸も、次回の開始時に
// これで拾って消す。
export const DBTEST_PREFIX = "__dbtest__";
