import {
  mapTripDays,
  remapEventDate,
  tripDayCount,
} from "../tripCopy";
import type { DB } from "./client";
import { err, ok, type Result } from "./result";

export type Currency = "JPY" | "USD";

// ── 作成（ゼロから or 過去の旅行をコピー） ───────────────────────────────
export type CreateTripInput = {
  title: string;
  startDate: string;
  endDate: string;
  displayName: string;
  currency: Currency;
  sourceTripId?: string; // 指定があればコピー
};

export async function createTrip(
  sb: DB,
  input: CreateTripInput,
): Promise<Result<{ tripId: string }>> {
  const { title, startDate, endDate, displayName, currency, sourceTripId } =
    input;

  // ── ゼロから新規 ──
  if (!sourceTripId) {
    const { data: tripId, error } = await sb.rpc("create_trip", {
      p_title: title,
      p_start_date: startDate,
      p_end_date: endDate,
      p_default_currency: currency,
      p_display_name: displayName,
    });
    if (error || !tripId) return err(error?.message ?? "作成に失敗しました");
    return ok({ tripId });
  }

  // ── 過去の旅行をコピー ──
  // コピー元の日程を取得（日付リマップの基準）。
  const { data: src, error: srcErr } = await sb
    .from("trips")
    .select("start_date, end_date")
    .eq("id", sourceTripId)
    .single();
  if (srcErr || !src || !src.start_date || !src.end_date) {
    return err("コピー元の旅行が見つかりません");
  }

  // shared かつ「全員参加」（participants 無し）の予定だけを対象に。
  const { data: rawEvents } = await sb
    .from("events")
    .select(
      "title, kind, all_day, start_at, end_at, start_tz, end_tz, place_id, visibility, note, event_participants(member_id)",
    )
    .eq("trip_id", sourceTripId);

  const shared = (rawEvents ?? []).filter(
    (e) =>
      e.visibility === "shared" && (e.event_participants?.length ?? 0) === 0,
  );

  // 新旅行の日程へ日付をリマップ（両端優先・真ん中潰し）。
  const srcDays = tripDayCount(src.start_date, src.end_date);
  const newDays = tripDayCount(startDate, endDate);
  const dayMap = mapTripDays(srcDays, newDays);

  const events: {
    title: string;
    kind: string;
    all_day: boolean;
    start_at: string;
    end_at: string | null;
    start_tz: string;
    end_tz: string | null;
    place_id: string | null;
    note: string | null;
  }[] = [];
  for (const e of shared) {
    const r = remapEventDate(
      { startAt: e.start_at, endAt: e.end_at },
      src.start_date,
      startDate,
      dayMap,
    );
    // 日程が短いと中日の予定は省かれる。フォーム側で事前に注意済み。
    if (!r) continue;
    events.push({
      title: e.title,
      kind: e.kind,
      all_day: e.all_day,
      start_at: r.startAt,
      end_at: r.endAt,
      start_tz: e.start_tz,
      end_tz: e.end_tz,
      place_id: e.place_id,
      note: e.note,
    });
  }

  const { data: tripId, error } = await sb.rpc("copy_trip", {
    p_source_trip_id: sourceTripId,
    p_title: title,
    p_start_date: startDate,
    p_end_date: endDate,
    p_default_currency: currency,
    p_display_name: displayName,
    p_events: events,
  });
  if (error || !tripId) return err(error?.message ?? "コピーに失敗しました");
  return ok({ tripId });
}

// ── タイトル・日程・精算通貨の更新（admin のみ。RLS で担保） ──────────────
export type UpdateTripInput = {
  title: string;
  startDate: string;
  endDate: string;
  currency: Currency;
};

export async function updateTrip(
  sb: DB,
  tripId: string,
  input: UpdateTripInput,
): Promise<Result<void>> {
  const { data, error } = await sb
    .from("trips")
    .update({
      title: input.title,
      start_date: input.startDate,
      end_date: input.endDate,
      default_currency: input.currency,
    })
    .eq("id", tripId)
    .select("id");
  if (error) return err(error.message);
  // 非 admin は RLS で 0 行になる → 権限エラーに変換。
  if (!data || data.length === 0) {
    return err("編集できる権限がありません（管理者のみ）");
  }
  return ok(undefined);
}

// ── 削除（admin のみ。関連テーブルは on delete cascade） ───────────────────
export async function deleteTrip(
  sb: DB,
  tripId: string,
  userId: string,
): Promise<Result<void>> {
  // 事前 admin チェック（明確なエラーメッセージのため）。RLS でも二重防御。
  const { data: me } = await sb
    .from("trip_members")
    .select("is_admin")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();
  if (!me?.is_admin) return err("旅行を削除できるのは管理者のみです");

  const { error } = await sb.from("trips").delete().eq("id", tripId);
  if (error) return err(error.message);
  return ok(undefined);
}
