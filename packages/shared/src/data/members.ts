import type { DB } from "./client";
import { err, ok, type Result } from "./result";

// メンバーを旅行から外す（admin の他者 remove も自分の退出も同じ RPC。RLS/RPC で権限判定）。
export async function removeTripMember(
  sb: DB,
  memberId: string,
): Promise<Result<void>> {
  const { error } = await sb.rpc("remove_trip_member", {
    p_member_id: memberId,
  });
  if (error) return err(error.message);
  return ok(undefined);
}

// 自分の display_name（この旅行内）を変える。RLS の trip_members_self_update で
// 自レコードのみ更新可なので RPC は不要。色は自動割当のままで触らない（name のみ）。
export async function updateMyMemberName(
  sb: DB,
  tripId: string,
  userId: string,
  name: string,
): Promise<Result<void>> {
  const { error } = await sb
    .from("trip_members")
    .update({ display_name: name })
    .eq("trip_id", tripId)
    .eq("user_id", userId);
  if (error) return err(error.message);
  return ok(undefined);
}
