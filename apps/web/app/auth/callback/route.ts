import { after, NextResponse } from "next/server";

import {
  backfillProfileFromIdentities,
  clearGeneratedGoogleAvatar,
} from "@triplot/shared/data/account";
import { redeemGuestUpgradeTicket } from "@triplot/shared/data/guestUpgrade";
import { classifyLinkFailure } from "@triplot/shared/loginMethods";
import { classifySignInError } from "@triplot/shared/signInError";

import { alertAdminAuthFailure } from "@/lib/auth/alertAdmin";

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
  // 失敗して戻ってきた時に Supabase が付ける理由（成功時は無い）。
  const failure = {
    error: searchParams.get("error"),
    code: searchParams.get("error_code"),
    description: searchParams.get("error_description"),
  };
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
    // 既に別のアカウントで使われている等は、Supabase が code の代わりに
    // error_code を付けて戻してくる。
    if (failure.code || !code) {
      // 理由の返り方（クエリか # の後ろか）を後から確かめられるように残す。
      // # の後ろはここに届かないので、その場合は error_code が空になる。
      console.log("[auth/callback] link failed", { provider: link, ...failure });
      const kind = classifyLinkFailure(failure);
      // キャンセルは失敗ではないので何も知らせない。
      if (kind === "canceled") return NextResponse.redirect(back);
      back.searchParams.set("link_provider", link);
      back.searchParams.set("link_error", kind);
      if (kind === "unavailable") {
        after(() =>
          alertAdminAuthFailure({
            provider: link,
            flow: "link",
            error: failure.error,
            errorCode: failure.code,
            errorDescription: failure.description,
          }),
        );
      }
      return NextResponse.redirect(back);
    }
    back.searchParams.set("link_provider", link);
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      back.searchParams.set(
        "link_error",
        classifyLinkFailure({ code: error.code, description: error.message }),
      );
    } else {
      back.searchParams.set("linked", "1");
    }
    return NextResponse.redirect(back);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.log("[auth/callback] sign-in code exchange failed", {
        provider,
        code: error.code,
        message: error.message,
      });
    }
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

  // ログインの失敗。理由を後から確かめられるよう残す（Supabase が code の代わりに
  // error_code を付けて戻す。# の後ろに付いた場合はここに届かない）。
  console.log("[auth/callback] sign-in failed", {
    provider,
    hasCode: Boolean(code),
    ...failure,
  });
  // 利用者への見せ方を3つに分ける（@triplot/shared/signInError）。
  // code を受け取れたのに交換で失敗した場合は、理由が付いていないので retry。
  const kind = classifySignInError(failure);
  if (kind === "canceled") return NextResponse.redirect(`${origin}/`);
  const failed = new URL("/", origin);
  failed.searchParams.set("auth_error", kind);
  if (kind === "unavailable") {
    if (isAuthProvider(provider)) failed.searchParams.set("auth_provider", provider);
    after(() =>
      alertAdminAuthFailure({
        provider: provider ?? "unknown",
        flow: "sign-in",
        error: failure.error,
        errorCode: failure.code,
        errorDescription: failure.description,
      }),
    );
  }
  return NextResponse.redirect(failed);
}
