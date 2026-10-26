import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type AuthUser = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  userMetadata: Record<string, unknown>;
};

// サーバー描画でログイン中の人を確かめる。ページ・ヘッダー等はこれを使い、
// auth.getUser() を直に呼ばない。
//
// - getClaims() はアクセストークンの署名を公開鍵で手元で確かめるので、認証サーバー
//   への往復が無い（署名鍵が非対称鍵＝ES256 だから。対称鍵だと中で getUser() に戻る）。
//   代わりに、他の端末でのログアウト等で取り消されたセッションも、トークンの期限
//   までは通る。DB（RLS）も同じトークンの署名しか見ていないので、読める範囲は変わらない。
// - cache() で1回の描画の中では1回だけにする（ページ本体と AppHeader が両方呼ぶ）。
//
// 書き込みの Server Action は今まで通り getUser() で確かめる（取り消し済みの
// セッションを通さない）。
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  return {
    id: claims.sub,
    email: claims.email || null,
    isAnonymous: claims.is_anonymous === true,
    userMetadata: (claims.user_metadata as Record<string, unknown>) ?? {},
  };
});
