import AsyncStorage from "@react-native-async-storage/async-storage";

// OAuth の「前回このログイン方法を使いました」バッジ用（web の
// lib/lastAuthProvider.ts が対応物・同じ cookie 名の意味を AsyncStorage に
// 持つ）。アカウントに紐づくデータではなく「この端末で最後に選んだ
// プロバイダ」というローカルな UX ヒントなので DB ではなく端末に持つ。

const KEY = "triplot.lastAuthProvider";

export type AuthProvider = "google" | "apple";

function isAuthProvider(v: string | null): v is AuthProvider {
  return v === "google" || v === "apple";
}

// サインインが実際に成功した時だけ呼ぶ（lib/auth.ts の signInWithGoogle/
// signInWithApple から）。
export async function setLastAuthProvider(provider: AuthProvider): Promise<void> {
  await AsyncStorage.setItem(KEY, provider);
}

export async function getLastAuthProvider(): Promise<AuthProvider | null> {
  const v = await AsyncStorage.getItem(KEY);
  return isAuthProvider(v) ? v : null;
}
