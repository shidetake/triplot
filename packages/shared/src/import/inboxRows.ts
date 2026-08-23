// 取り込み受信箱の行の組み立て。fetchImportInboxRows が返す生の行を、
// 画面が出す1メール＝1行の形に畳む。web と RN で同じ関数を使う。
//
// 表示・推測は「作業状態＝未確定の下書き行」で行う。単一推測は抽出時に
// 自動で旅行へ割り当て済みなので、ここに未割当で残るのは人が選ぶものだけ。

import type { EventDraft, Extraction, Receipt } from "./schema";

export interface InboxRow {
  id: string;
  // 費用の下書き（1メールに高々1つ）。
  receipt: Receipt | null;
  // 予定の下書き（複数あり得る）。
  events: EventDraft[];
  // このメール「自身の」抽出値。合体の内訳表示で使う（分けられない本体）。
  own: Extraction | null;
  assignedTripId: string | null;
  // 割り当て select の初期値（未割当は空文字）。
  defaultTripId: string;
  // このメールに合体された子メール（誤マージの確認と split 用）。
  children: { id: string; own: Extraction | null }[];
}

export function deriveInboxRows(input: {
  emails: { id: string; extracted: unknown; trip_id: string | null }[] | null;
  draftRows: { email_id: string; kind: string; payload: unknown }[] | null;
  mergedChildren:
    { id: string; extracted: unknown; merged_into: string | null }[] | null;
}): InboxRow[] {
  const itemsByEmail = new Map<string, { kind: string; payload: unknown }[]>();
  for (const d of input.draftRows ?? []) {
    const arr = itemsByEmail.get(d.email_id) ?? [];
    arr.push(d);
    itemsByEmail.set(d.email_id, arr);
  }

  const childrenByParent = new Map<
    string,
    { id: string; own: Extraction | null }[]
  >();
  for (const c of input.mergedChildren ?? []) {
    if (!c.merged_into) continue;
    const arr = childrenByParent.get(c.merged_into) ?? [];
    arr.push({ id: c.id, own: (c.extracted as Extraction | null) ?? null });
    childrenByParent.set(c.merged_into, arr);
  }

  return (input.emails ?? []).map((e) => {
    const items = itemsByEmail.get(e.id) ?? [];
    return {
      id: e.id,
      receipt:
        (items.find((i) => i.kind === "expense")?.payload as
          Receipt | undefined) ?? null,
      events: items
        .filter((i) => i.kind === "event")
        .map((i) => i.payload as EventDraft),
      own: (e.extracted as Extraction | null) ?? null,
      assignedTripId: e.trip_id,
      defaultTripId: e.trip_id ?? "",
      children: childrenByParent.get(e.id) ?? [],
    };
  });
}
