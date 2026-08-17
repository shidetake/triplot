import { NextResponse } from "next/server";

import { backfillProfileFromIdentities } from "@triplot/shared/data/account";

import {
  isAuthProvider,
  LAST_AUTH_PROVIDER_COOKIE,
} from "@/lib/lastAuthProvider";
import { createClient } from "@/lib/supabase/server";

// Supabase OAuth の callback。?code=... を session に交換し、next または / にリダイレクト。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const provider = searchParams.get("provider");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Apple サインアップ（名前・写真を返さないことが多い）の後、同じメール
      // アドレスで Google が自動リンクされたケースの穴埋め。display_name/
      // avatar_url が既に入っていれば何もしない（詳細は account.ts のコメント）。
      if (data.user) {
        await backfillProfileFromIdentities(
          supabase,
          data.user.id,
          data.user.identities ?? null,
        );
      }
      const res = NextResponse.redirect(`${origin}${next}`);
      // 「前回このログイン方法を使いました」バッジ用（アカウントに紐づく
      // データではなくこの端末のローカルな UX ヒントなので cookie に持つ）。
      // サインインが実際に成功した時だけ書く（クリック時点ではまだ書かない）。
      if (isAuthProvider(provider)) {
        res.cookies.set(LAST_AUTH_PROVIDER_COOKIE, provider, {
          maxAge: 60 * 60 * 24 * 365,
          path: "/",
          sameSite: "lax",
        });
      }
      return res;
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
