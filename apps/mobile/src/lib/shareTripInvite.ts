import { Alert, Share } from "react-native";

import { ensureTripInvite } from "@triplot/shared/data/invites";

import { generateInviteToken } from "@/lib/inviteToken";
import { supabase } from "@/lib/supabase";

// 招待リンクの受け側は web（/join/[token]）。アプリからは共有のみ。
export const JOIN_BASE_URL = "https://triplot.app";

// 招待リンクを確保して iOS 共有シートを開く（ヘッダーの共有ボタンと
// 旅行の編集モーダルの両方から使う1関数）。
export async function shareTripInvite(tripId: string): Promise<void> {
  const r = await ensureTripInvite(supabase, tripId, generateInviteToken());
  if (!r.ok) {
    Alert.alert(r.error);
    return;
  }
  await Share.share({ message: `${JOIN_BASE_URL}/join/${r.data.token}` });
}
