// OAuth の「前回このログイン方法を使いました」バッジ用。アカウントに紐づく
// データではなく「この端末で最後に選んだプロバイダ」というローカルな UX ヒント
// なので、DB ではなく cookie に持つ（RN 側は AsyncStorage が対応物。
// apps/mobile/src/lib/lastAuthProvider.ts）。
// クライアント・サーバー両方から import 可能な定数と型のみ。cookies() を使う
// 解決関数は lastAuthProvider.server.ts に分離している（i18n/theme.ts と同じ形）。

export const LAST_AUTH_PROVIDER_COOKIE = "triplot_last_provider";

export type AuthProvider = "google" | "apple";

export function isAuthProvider(
  v: string | undefined | null,
): v is AuthProvider {
  return v === "google" || v === "apple";
}
