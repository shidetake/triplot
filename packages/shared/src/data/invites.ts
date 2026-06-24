import { generateInviteToken } from "../invite";
import type { DB } from "./client";
import { err, ok, type Result } from "./result";

// 招待トークンで旅行に参加する。セッション（匿名 or Google）必須。
// 成功で参加した trip の id を返す（呼び出し側で遷移）。
export async function joinTripViaInvite(
  sb: DB,
  token: string,
  displayName: string,
): Promise<Result<{ tripId: string }>> {
  const { data: tripId, error } = await sb.rpc("join_trip_via_invite", {
    p_token: token,
    p_display_name: displayName,
  });
  if (error || !tripId) return err(error?.message ?? "errors.joinFailed");
  return ok({ tripId });
}

// 共有リンクの取得 or 初回発行（冪等）。既にあれば既存トークンが返る。
export async function ensureTripInvite(
  sb: DB,
  tripId: string,
): Promise<Result<{ token: string }>> {
  const { data: token, error } = await sb.rpc("ensure_trip_invite", {
    p_trip_id: tripId,
    p_token: generateInviteToken(),
  });
  if (error || !token) return err(error?.message ?? "errors.issueFailed");
  return ok({ token });
}

// 共有リンクの再生成（旧リンク即失効）。
export async function regenerateTripInvite(
  sb: DB,
  tripId: string,
): Promise<Result<{ token: string }>> {
  const { data: token, error } = await sb.rpc("regenerate_trip_invite", {
    p_trip_id: tripId,
    p_token: generateInviteToken(),
  });
  if (error || !token) return err(error?.message ?? "errors.regenerateFailed");
  return ok({ token });
}
