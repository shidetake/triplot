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
// signInWithIdToken は呼ばない）。キャンセルは null。
//
// **既に許可されているなら addScopes を呼ばない。** addScopes は許可済みでも
// ブラウザで同意画面を開くので、無条件に呼ぶとエクスポートのたびに同意を
// 求めることになる。付与済みスコープ（getCurrentUser().scopes）を先に見て、
// 足りているならそのままトークンを取る。
export async function getGcalAccessToken(): Promise<string | null> {
  try {
    // 端末に前回のサインインが残っていても、アプリ起動直後は getCurrentUser()
    // が null なので、まず無操作で復元してから権限を見る（復元できなければ
    // 下の対話サインインに落ちる）。
    if (GoogleSignin.hasPreviousSignIn()) {
      await GoogleSignin.signInSilently().catch(() => {});
    }
    if (GoogleSignin.getCurrentUser() == null) {
      const r = await GoogleSignin.signIn();
      if (!isSuccessResponse(r)) return null; // キャンセル
    }
    if (!GoogleSignin.getCurrentUser()?.scopes.includes(GCAL_SCOPE)) {
      const r = await GoogleSignin.addScopes({ scopes: [GCAL_SCOPE] });
      if (r == null) return null; // サインイン状態が失われた等
    }
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
