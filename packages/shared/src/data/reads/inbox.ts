import type { DB } from "../client";

// メール取り込み（受信箱）まわりの読み取り。web
// （apps/web/app/import/page.tsx と trips/[tripId]/page.tsx）から移設
// （クエリは挙動不変）。RN の受信箱・下書き確定も同じ関数を使う。

// 旅行に割り当て済み・未確定の取り込み下書き（自分の分。RLS で own のみ）。
// 費用/予定の1項目 = inbound_drafts の1行。
export async function fetchTripPendingDrafts(sb: DB, tripId: string) {
  const { data } = await sb
    .from("inbound_drafts")
    .select("id, kind, payload, inbound_emails!inner(trip_id, status)")
    .eq("inbound_emails.trip_id", tripId)
    .eq("inbound_emails.status", "extracted")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return data;
}

// 受信箱バッジの件数 = まだ旅行に割り当てていない下書きメール（要割当）。
// web の AppHeader と RN の旅行一覧ヘッダーで共有。
export async function fetchUnassignedInboundCount(
  sb: DB,
  userId: string,
): Promise<number> {
  const { count } = await sb
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "extracted")
    .is("trip_id", null);
  return count ?? 0;
}

// 受信箱ページの読み取り一式。RLS で全て自分の行に絞られる。
export async function fetchImportInboxRows(sb: DB, userId: string) {
  // 転送先アドレス（per-user・固定。無ければ発行）。
  const { data: importToken } = await sb.rpc("ensure_import_token");

  // 自分が在籍中の旅行（割り当て先 ＋ 旅行推測）。
  const { data: memberships } = await sb
    .from("trip_members")
    .select("trips(id, title, start_date, end_date)")
    .eq("user_id", userId)
    .is("left_at", null);
  const trips = (memberships ?? [])
    .map((m) => m.trips)
    .filter((trip): trip is NonNullable<typeof trip> => trip !== null);

  // 自分の抽出済みメール。割当済も未割当もここに出す。
  const { data: emails } = await sb
    .from("inbound_emails")
    .select("id, received_at, subject, extracted, trip_id")
    .eq("status", "extracted")
    .order("received_at", { ascending: false });

  // 各メールの未確定の下書き（作業状態）。確定済みは各旅行に反映済みなので出さない。
  const emailIds = (emails ?? []).map((e) => e.id);
  const { data: draftRows } =
    emailIds.length > 0
      ? await sb
          .from("inbound_drafts")
          .select("email_id, kind, payload")
          .eq("status", "pending")
          .in("email_id", emailIds)
          .order("created_at", { ascending: true })
      : { data: [] };

  // 取り込みに失敗した行。next_retry_at があれば自動リトライ待ち。
  const { data: errorRows } = await sb
    .from("inbound_emails")
    .select("id, subject, sender, received_at, extract_error, next_retry_at")
    .eq("status", "error")
    .order("received_at", { ascending: false });

  // 当月の取り込み使用量と、上限超過で保留中の件数。
  const monthStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  ).toISOString();
  const { count: usedThisMonth } = await sb
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .gte("extracted_at", monthStart);
  const { count: overQuota } = await sb
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("status", "over_quota");

  // 各メールに合体された子メール（誤マージ確認・split 用）。
  const { data: mergedChildren } =
    emailIds.length > 0
      ? await sb
          .from("inbound_emails")
          .select("id, extracted, merged_into")
          .eq("status", "merged")
          .in("merged_into", emailIds)
      : { data: [] };

  return {
    importToken,
    trips,
    emails,
    draftRows,
    errorRows,
    usedThisMonth,
    overQuota,
    mergedChildren,
  };
}
