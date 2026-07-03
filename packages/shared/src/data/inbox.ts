import type { DB } from "./client";
import { err, ok, type Result } from "./result";

// 取り込み（受信メール下書き）の操作。権限は各 RPC が auth.uid() を確認。

// 下書き（費用/予定の1項目）を確定/破棄する。確定時は作成した費用/予定の id を紐づける。
// 親メールの全項目が解決されるとメール自体も自動で確定/破棄される（RPC 側）。
export async function resolveInboundDraft(
  sb: DB,
  draftId: string,
  status: "confirmed" | "dismissed",
  ids: { expenseId?: string; eventId?: string } = {},
): Promise<Result<void>> {
  const { error } = await sb.rpc("resolve_inbound_draft", {
    p_id: draftId,
    p_status: status,
    // gen-types は nullable 引数を string にする癖。
    p_expense_id: (ids.expenseId ?? null) as unknown as string,
    p_event_id: (ids.eventId ?? null) as unknown as string,
  });
  if (error) return err(error.message);
  return ok(undefined);
}

// メールを破棄する（残っている未確定の下書きを全部 dismissed に。確定済みはそのまま）。
export async function dismissInboundEmail(
  sb: DB,
  id: string,
): Promise<Result<void>> {
  const { error } = await sb.rpc("dismiss_inbound_email", { p_id: id });
  if (error) return err(error.message);
  return ok(undefined);
}

// 誤マージを取り消す（合体された子を独立下書きに戻す）。
export async function unmergeInboundEmail(
  sb: DB,
  id: string,
): Promise<Result<void>> {
  const { error } = await sb.rpc("unmerge_inbound_email", { p_id: id });
  if (error) return err(error.message);
  return ok(undefined);
}

// 下書きを旅行に割り当てる（費用化＝確定は旅行画面で行う）。tripId 未選択は null。
export async function assignInboundEmailTrip(
  sb: DB,
  id: string,
  tripId: string | null,
): Promise<Result<void>> {
  const { error } = await sb.rpc("assign_inbound_email_trip", {
    p_id: id,
    // gen-types は nullable 引数を string にする癖。未選択は null で渡す。
    p_trip_id: tripId as unknown as string,
  });
  if (error) return err(error.message);
  return ok(undefined);
}
