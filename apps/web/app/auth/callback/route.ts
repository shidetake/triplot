import { NextResponse } from "next/server";

import {
  backfillProfileFromIdentities,
  clearGeneratedGoogleAvatar,
} from "@triplot/shared/data/account";
import { redeemGuestUpgradeTicket } from "@triplot/shared/data/guestUpgrade";
import { classifyLinkError } from "@triplot/shared/loginMethods";

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
  // ゲストからの昇格。ここに来た時点でセッションは新しいアカウントに
  // 切り替わっているので、ゲストのうちに取っておいた券をここで引き換える。
  const upgrade = searchParams.get("upgrade");
  // 設定の「ログイン方法」からの追加（LoginMethods）。ログインではないので、
  // プロフィールの穴埋めや「前回のログイン方法」の記録はしない。結果は戻り先の
  // URL に付けて、LinkResultToast が知らせる。
  const link = searchParams.get("link");
  if (isAuthProvider(link)) {
    // 戻り先は同じサイト内のパスだけ（別サイトへ飛ばされないように）。
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    const back = new URL(safeNext, origin);
    back.searchParams.set("link_provider", link);
    // 既に別のアカウントで使われている等は、Supabase が code の代わりに
    // error_code を付けて戻してくる。
    const errorCode = searchParams.get("error_code");
    if (errorCode || !code) {
      back.searchParams.set(
        "link_error",
        classifyLinkError({
          code: errorCode,
          message: searchParams.get("error_description"),
        }),
      );
      return NextResponse.redirect(back);
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      back.searchParams.set("link_error", classifyLinkError(error));
    } else {
      back.searchParams.set("linked", "1");
    }
    return NextResponse.redirect(back);
  }

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
      // Google が写真未設定のアカウントに返す「頭文字入りの画像」を、写真として
      // 持ち続けないようにする（旅行内でメンバー色が出なくなるため）。
      // 判定できなければ何もしない（account.ts のコメント参照）。
      const googleToken = data.session?.provider_token;
      if (data.user && provider === "google" && googleToken) {
        await clearGeneratedGoogleAvatar(supabase, data.user.id, googleToken);
      }
      // 引き換えに失敗しても、サインイン自体は成功しているのでここでは止めない
      // （旅行はゲストのメンバー行に残っており、券は30分有効なので押し直せる）。
      if (upgrade) await redeemGuestUpgradeTicket(supabase, upgrade);
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
