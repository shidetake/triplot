"use client";

import { useState } from "react";

import { toast } from "@/components/toast";
import { createClient } from "@/lib/supabase/client";

// 開発用ログイン（`next dev` の時だけ）。
//
// web の入口は OAuth（Google / Apple）だけで、自動テストや AI エージェントの
// 画面確認からはサインインできない。iOS には同じ用途の開発用ログインが既に
// あり（apps/mobile/src/lib/auth.ts の signInWithDevPassword）、それの web 版。
//
// 資格情報は gitignore された .env.local 系にだけ置く
// （NEXT_PUBLIC_DEV_LOGIN_EMAIL / NEXT_PUBLIC_DEV_LOGIN_PASSWORD）。
// **本番ビルドではボタン自体が存在しない**: NODE_ENV での分岐なので、
// next build 時にこの分岐ごと落ちる（環境変数の設定ミスで出てしまう事故を
// 防ぐため、env が有るかどうかではなく NODE_ENV を先に見る）。
const devEmail = process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL;
const devPassword = process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD;
export const devSignInAvailable =
  process.env.NODE_ENV === "development" && Boolean(devEmail && devPassword);

export function DevSignInButton() {
  const [busy, setBusy] = useState(false);
  if (!devSignInAvailable) return null;

  const signIn = async () => {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: devEmail!,
      password: devPassword!,
    });
    if (error) {
      setBusy(false);
      toast(error.message);
      return;
    }
    // middleware（proxy.ts）が cookie を張り直すのでフルリロードで入り直す。
    window.location.href = "/trips";
  };

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={busy}
      className="text-xs text-blue-600 underline-offset-2 hover:underline disabled:opacity-50"
    >
      開発用ログイン
    </button>
  );
}
