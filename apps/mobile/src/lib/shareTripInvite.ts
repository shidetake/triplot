import * as Application from "expo-application";
import Constants from "expo-constants";
import { Alert, Share } from "react-native";

import { ensureTripInvite } from "@triplot/shared/data/invites";

import { generateInviteToken } from "@/lib/inviteToken";
import { supabase } from "@/lib/supabase";

// 招待リンクの受け側は web（/join/[token]）。アプリからは共有のみ。
export const JOIN_BASE_URL = "https://triplot.app";

// **リンクは、そのビルドが書き込んだ DB を読める先に向ける。**
// web は今いるホストから組んでいる（apps/web の inviteBaseUrl）ので、確認用の
// プレビューでは自動的に確認用のリンクになる。アプリも同じ考え方で揃える。
//
// preview ビルド（staging）が triplot.app を共有すると、二重に噛み合わない:
//   - Universal Link の宣言を持つのは本番アプリだけ（同じドメインを2つのアプリが
//     宣言すると、どちらが受けるか OS 依存になる。app.config.ts 参照）
//   - そもそも triplot.app が読むのは**本番の DB**。preview ビルドが作った
//     トークンは staging の DB にあるので、開けても「無効な招待リンク」になる
//
// なので staging は**自分のカスタムスキーム**を共有する。受け口は同じ
// join/[token] 画面で、踏めるのは preview ビルドが入った端末だけだが、
// 確認したいのはまさにその端末。
function joinUrl(token: string): string {
  const staging = Application.applicationId?.endsWith(".staging") ?? false;
  const scheme = staging ? appScheme() : null;
  return scheme ? `${scheme}://join/${token}` : `${JOIN_BASE_URL}/join/${token}`;
}

// このビルドのカスタムスキーム（app.config.ts の scheme）。値を持たない
// ビルドでは本番のリンクに落とす＝リンクが壊れた形になるより、開ける先が
// 違う方がまだ分かりやすい。
function appScheme(): string | null {
  const s = Constants.expoConfig?.scheme;
  return Array.isArray(s) ? (s[0] ?? null) : (s ?? null);
}

// 招待リンクを確保して iOS 共有シートを開く（ヘッダーの共有ボタンと
// 旅行の編集モーダルの両方から使う1関数）。
export async function shareTripInvite(tripId: string): Promise<void> {
  const r = await ensureTripInvite(supabase, tripId, generateInviteToken());
  if (!r.ok) {
    Alert.alert(r.error);
    return;
  }
  await Share.share({ message: joinUrl(r.data.token) });
}
