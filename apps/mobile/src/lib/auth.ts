import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

import {
  backfillProfileFromIdentities,
  clearGeneratedGoogleAvatar,
} from "@triplot/shared/data/account";
import {
  createGuestUpgradeTicket,
  redeemGuestUpgradeTicket,
} from "@triplot/shared/data/guestUpgrade";

import { setLastAuthProvider } from "./lastAuthProvider";
import { supabase } from "./supabase";

// ネイティブの Sign in with Apple / Google Sign-In → Supabase の
// signInWithIdToken に繋ぐ（web の OAuth リダイレクトフローは使わない）。
// どちらもキャンセル時は false を返し、失敗時は throw する。

// Apple の本人確認ダイアログを出して、Supabase に渡す証明（id_token と nonce）を
// もらう。ログインとログイン方法の追加で共通。閉じられたら null。
async function appleCredential(): Promise<{ token: string; nonce: string } | null> {
  // Supabase は id_token の nonce（SHA256 前の生値）を検証する。
  // Apple へはハッシュを渡し、Supabase へは生値を渡す（公式パターン）。
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e) {
    // ユーザーがダイアログを閉じた（ERR_REQUEST_CANCELED）は正常系。
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw e;
  }
  if (!credential.identityToken) {
    throw new Error("Apple identityToken missing");
  }
  return { token: credential.identityToken, nonce: rawNonce };
}

export async function signInWithApple(): Promise<boolean> {
  const credential = await appleCredential();
  if (!credential) return false;
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.token,
    nonce: credential.nonce,
  });
  if (error) throw error;
  await setLastAuthProvider("apple");
  await backfillIdentityProfile(data.user);
  return true;
}

// Apple サインアップ（名前・写真を返さないことが多い）の後、同じメール
// アドレスで Google が自動リンクされたケースの穴埋め。display_name/
// avatar_url が既に入っていれば何もしない（詳細は shared/data/account.ts
// のコメント）。失敗（Result.error）してもサインイン自体は成功扱いのまま進める。
async function backfillIdentityProfile(
  user: { id: string; identities?: { identity_data?: unknown }[] | null } | null,
): Promise<void> {
  if (!user) return;
  await backfillProfileFromIdentities(
    supabase,
    user.id,
    (user.identities as { identity_data?: Record<string, unknown> | null }[]) ??
      null,
  );
}

// Google Sign-In は Google Cloud Console の iOS OAuth Client が要る。
// 未設定の間はサインイン画面にボタンを出さない（app.config.ts の plugin 分岐と対）。
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export const googleSignInAvailable = Boolean(
  googleWebClientId && googleIosClientId,
);

if (googleSignInAvailable) {
  GoogleSignin.configure({
    // webClientId は Supabase が id_token の audience 検証に使う既存 web 用 Client ID。
    webClientId: googleWebClientId,
    iosClientId: googleIosClientId,
  });
}

// Google の本人確認を出して、Supabase に渡す id_token をもらう。ログインと
// ログイン方法の追加で共通。閉じられたら null。
async function googleIdToken(): Promise<string | null> {
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null; // キャンセル
  const idToken = response.data.idToken;
  if (!idToken) throw new Error("Google idToken missing");
  return idToken;
}

export async function signInWithGoogle(): Promise<boolean> {
  const idToken = await googleIdToken();
  if (!idToken) return false;
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });
  if (error) throw error;
  await setLastAuthProvider("google");
  await backfillIdentityProfile(data.user);
  // Google が写真未設定のアカウントに返す「頭文字入りの画像」を、写真として
  // 持ち続けないようにする（旅行内でメンバー色が出なくなるため）。アクセス
  // トークンは SDK から取るだけで、ユーザーの操作は増えない。
  // 失敗してもサインインは成功扱い（backfill と同じ扱い）。
  if (data.user) {
    try {
      const { accessToken } = await GoogleSignin.getTokens();
      if (accessToken) {
        await clearGeneratedGoogleAvatar(supabase, data.user.id, accessToken);
      }
    } catch {
      // 取れなければ何もしない。
    }
  }
  return true;
}

// 設定の「ログイン方法」から、今のアカウントに Google / Apple を足す。
// 足すだけで、アカウントの統合はしない。その Google / Apple で既に別の
// アカウントがあると Supabase が断る（呼び出し側が classifyLinkError で
// 見分けて案内を出す。@triplot/shared/loginMethods）。
// 閉じられたら false、失敗は throw。
export async function linkLoginMethod(
  provider: "google" | "apple",
): Promise<boolean> {
  if (provider === "apple") {
    const credential = await appleCredential();
    if (!credential) return false;
    const { error } = await supabase.auth.linkIdentity({
      provider: "apple",
      token: credential.token,
      nonce: credential.nonce,
    });
    if (error) throw error;
    return true;
  }
  const idToken = await googleIdToken();
  if (!idToken) return false;
  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    token: idToken,
  });
  if (error) throw error;
  return true;
}

// ゲスト（匿名サインイン）から本アカウントへの昇格。
//
// サインインするとセッションが新しいアカウントに切り替わるので、**ゲストのうちに**
// 引き換え券を取っておき、サインイン後に引き換える。web も同じ手順
// （packages/shared/src/data/guestUpgrade.ts）。リダイレクトを挟まないぶん、
// ここでは1つの関数に収まる。
//
// 券を取るところで失敗したらサインインしない（引き継がずにアカウントだけ
// 作ってしまうと、ゲスト時代の旅行に戻る手段が無くなるため）。
// キャンセル時は false を返す。
export async function upgradeGuest(
  provider: "google" | "apple",
): Promise<boolean> {
  const ticket = await createGuestUpgradeTicket(supabase);
  if (!ticket.ok) throw new Error(ticket.error);

  const signedIn =
    provider === "apple" ? await signInWithApple() : await signInWithGoogle();
  if (!signedIn) return false; // キャンセル

  const redeemed = await redeemGuestUpgradeTicket(supabase, ticket.data.token);
  if (!redeemed.ok) throw new Error(redeemed.error);
  return true;
}

// ── 開発用ログイン（__DEV__ のみ） ──
// シミュレータの Apple ID サインインが不安定で Sign in with Apple の検証が
// できないため、開発中はメール+パスワードで自分のアカウントに入る。
// 資格情報は gitignore された .env.local（EXPO_PUBLIC_DEV_LOGIN_*）にだけ置く。
// 本番ビルド（__DEV__=false）ではボタン自体を出さない。
const devEmail = process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL;
const devPassword = process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD;

export const devSignInAvailable = __DEV__ && Boolean(devEmail && devPassword);

// さらに EXPO_PUBLIC_DEV_AUTO_LOGIN=1 なら、サインイン画面表示時に自動で
// 開発用ログインする（シミュレータをヘッドレス検証する時のタップ省略用）。
export const devAutoLogin =
  devSignInAvailable && process.env.EXPO_PUBLIC_DEV_AUTO_LOGIN === "1";

export async function signInWithDevPassword(): Promise<boolean> {
  if (!devEmail || !devPassword) throw new Error("dev login not configured");
  const { error } = await supabase.auth.signInWithPassword({
    email: devEmail,
    password: devPassword,
  });
  if (error) throw error;
  return true;
}

export async function signOut(): Promise<void> {
  if (googleSignInAvailable) {
    // Google 側のセッションも切っておく（次回サインインでアカウント選択を出すため）。
    await GoogleSignin.signOut().catch(() => {});
  }
  await supabase.auth.signOut();
}
