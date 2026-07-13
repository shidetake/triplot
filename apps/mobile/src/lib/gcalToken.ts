import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";

import { GCAL_SCOPE } from "@triplot/shared/gcalApi";

// Google カレンダーエクスポート用のアクセストークン取得（RN 版）。
// web の GIS ポップアップに相当する。アプリのログインが Apple でも、ここで
// 別途 Google にサインインすれば良い（Supabase のセッションには触らない＝
// signInWithIdToken は呼ばない）。スコープは追加リクエスト（incremental
// consent）で、未同意なら同意画面が出る。キャンセルは null。
export async function getGcalAccessToken(): Promise<string | null> {
  try {
    if (!GoogleSignin.hasPreviousSignIn()) {
      const r = await GoogleSignin.signIn();
      if (!isSuccessResponse(r)) return null; // キャンセル
    }
    const r = await GoogleSignin.addScopes({ scopes: [GCAL_SCOPE] });
    if (r == null) return null; // サインイン状態が失われた等
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken;
  } catch (e) {
    // 同意画面のキャンセルはエラーとして届くので null に落とす。
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
      return null;
    }
    throw e;
  }
}
