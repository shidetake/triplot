import type { DB } from "./client";
import { err, ok, type Result } from "./result";

// ゲスト（匿名サインイン）から本アカウントへの昇格。
//
// サインインするとセッションがゲストから新しいアカウントへ切り替わるので、
// 「さっきのゲストは自分だった」を示す手段が要る。そのために、ゲストのうちに
// 使い捨ての引き換え券を発行しておき、サインイン後にそれを引き換える。
//
// 手順は web もネイティブも同じ:
//   createGuestUpgradeTicket() → いつもどおりサインイン → redeemGuestUpgradeTicket()

// ゲスト本人だけが発行できる。30分で失効し、一度使うと無効になる。
export async function createGuestUpgradeTicket(
  sb: DB,
): Promise<Result<{ token: string }>> {
  const { data: token, error } = await sb.rpc("create_guest_upgrade_ticket");
  if (error || !token) return err(error?.message ?? "errors.upgradeFailed");
  return ok({ token });
}

// サインイン後に呼ぶ。ゲストが参加していた旅行と、その人が書いたものが
// すべて呼び出し元のアカウントへ移り、ゲストのユーザーは消える。
export async function redeemGuestUpgradeTicket(
  sb: DB,
  token: string,
): Promise<Result> {
  const { error } = await sb.rpc("redeem_guest_upgrade_ticket", {
    p_token: token,
  });
  if (error) return err(error.message ?? "errors.upgradeFailed");
  return ok(undefined);
}
