import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

import { supabase } from "./supabase";

// ネイティブの Sign in with Apple / Google Sign-In → Supabase の
// signInWithIdToken に繋ぐ（web の OAuth リダイレクトフローは使わない）。
// どちらもキャンセル時は false を返し、失敗時は throw する。

export async function signInWithApple(): Promise<boolean> {
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
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return false;
    throw e;
  }
  if (!credential.identityToken) {
    throw new Error("Apple identityToken missing");
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  return true;
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

export async function signInWithGoogle(): Promise<boolean> {
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return false; // キャンセル
  const idToken = response.data.idToken;
  if (!idToken) throw new Error("Google idToken missing");
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });
  if (error) throw error;
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
