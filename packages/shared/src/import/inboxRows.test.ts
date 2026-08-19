import { describe, expect, it } from "vitest";

import { deriveInboxRows } from "./inboxRows";

const email = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  extracted: null,
  trip_id: null,
  ...over,
});

describe("deriveInboxRows", () => {
  it("下書きをメール単位にまとめ、費用と予定に振り分ける", () => {
    const rows = deriveInboxRows({
      emails: [email("e1")],
      draftRows: [
        { email_id: "e1", kind: "expense", payload: { total: 100 } },
        { email_id: "e1", kind: "event", payload: { title: "A" } },
        { email_id: "e1", kind: "event", payload: { title: "B" } },
      ],
      mergedChildren: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].receipt).toEqual({ total: 100 });
    expect(rows[0].events.map((e) => e.title)).toEqual(["A", "B"]);
  });

  it("費用の下書きは高々1つ（複数あっても先頭を使う）", () => {
    const rows = deriveInboxRows({
      emails: [email("e1")],
      draftRows: [
        { email_id: "e1", kind: "expense", payload: { total: 1 } },
        { email_id: "e1", kind: "expense", payload: { total: 2 } },
      ],
      mergedChildren: null,
    });
    expect(rows[0].receipt).toEqual({ total: 1 });
  });

  it("下書きが無いメールも行として残す（読み取り内容なしとして出す）", () => {
    const rows = deriveInboxRows({
      emails: [email("e1")],
      draftRows: [],
      mergedChildren: null,
    });
    expect(rows[0].receipt).toBeNull();
    expect(rows[0].events).toEqual([]);
  });

  it("合体された子メールを親にぶら下げる", () => {
    const rows = deriveInboxRows({
      emails: [email("parent")],
      draftRows: null,
      mergedChildren: [
        { id: "c1", extracted: { receipt: { total: 1 } }, merged_into: "parent" },
        { id: "c2", extracted: null, merged_into: "parent" },
        // 親が今回の一覧に居ない子は捨てられる（map に無いだけ）
        { id: "c3", extracted: null, merged_into: "other" },
      ],
    });
    expect(rows[0].children.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("merged_into が無い行は無視する", () => {
    const rows = deriveInboxRows({
      emails: [email("e1")],
      draftRows: null,
      mergedChildren: [{ id: "c1", extracted: null, merged_into: null }],
    });
    expect(rows[0].children).toEqual([]);
  });

  it("割り当て済みは select の初期値に旅行が入る／未割当は空文字", () => {
    const rows = deriveInboxRows({
      emails: [email("e1", { trip_id: "t1" }), email("e2")],
      draftRows: null,
      mergedChildren: null,
    });
    expect(rows[0].assignedTripId).toBe("t1");
    expect(rows[0].defaultTripId).toBe("t1");
    expect(rows[1].assignedTripId).toBeNull();
    expect(rows[1].defaultTripId).toBe("");
  });

  it("入力が全部 null でも落ちない", () => {
    expect(
      deriveInboxRows({ emails: null, draftRows: null, mergedChildren: null }),
    ).toEqual([]);
  });
});
