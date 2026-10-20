import type { StoredEventDraft } from "./drafts";
import type { EventDraft } from "./schema";

// 取り込んだ予定が「予約が要るもので、メールが届いた時点で予約が済んでいる」か。
//
// 航空券・列車・ホテル等の予約メールは、予約を済ませた結果として届く。確定する
// 時に要予約のチェックを入れておき、予約の TODO を済みで作ると、後から
// 「予約が要ったが、もう済んでいる」が一目で分かる。
//
// **決めるのはサービスの種類。** 予約が要るかどうかは種類でほぼ決まり、
// 1通ずつの判断（「これは予約メールか」）を LLM に任せるよりぶれない。
// 配車・タクシーは乗った後に届く領収書で、予約ではないので外す。
const BOOKED_SERVICES: ReadonlySet<EventDraft["service"]> = new Set([
  "flight",
  "rail",
  "ferry",
  "bus",
  "lodging",
  "dining",
  "activity",
]);

export function isBookedService(ev: StoredEventDraft): boolean {
  // 推定の予定（食事・買い物のカード明細等）は、その場で払った
  // 記録で予約ではない。飲食でも「レストラン予約」とは分ける。
  if (ev.timeFromReceipt) return false;
  // **service を持たない下書き**（この項目を足す前に取り込んだもの）は、
  // 便名で引けたフライトだけ航空便と分かる。それ以外は判断材料が無いので
  // 予約済みにしない（チェックが入らないだけで、今までと同じ）。
  // 保存された payload は型を通さず読んでいるので、型の上では必ずあっても
  // 実物には無いことがある。
  const stored: EventDraft["service"] | undefined = ev.service;
  const service = stored ?? (ev.resolvedFlight ? "flight" : undefined);
  return service !== undefined && BOOKED_SERVICES.has(service);
}
