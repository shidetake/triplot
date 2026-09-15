import { describe, expect, it } from "vitest";

import { deriveSplitSubmission } from "./expenseSplit";

const ME = "me";
const OTHER = "other";

describe("deriveSplitSubmission", () => {
  it("払った人が自分のためだけに払ったなら、割り勘しない", () => {
    expect(
      deriveSplitSubmission({
        visibility: "shared",
        payerMemberId: ME,
        selectedMemberIds: [ME],
        everyone: false,
      }),
    ).toEqual({ splittable: false, splitEveryone: true, splitMemberIds: [] });
  });

  // 実データで壊れていたケース。見ている人で判定していたため「割り勘しない」に
  // なり、一覧にも出ず精算からも消えていた（借りがあるのに 0 円扱い）。
  it("他の人が自分のためだけに払ったなら、割り勘として残す", () => {
    expect(
      deriveSplitSubmission({
        visibility: "shared",
        payerMemberId: OTHER,
        selectedMemberIds: [ME],
        everyone: false,
      }),
    ).toEqual({
      splittable: true,
      splitEveryone: false,
      splitMemberIds: [ME],
    });
  });

  it("全員なら具体的な ID を焼き込まない", () => {
    expect(
      deriveSplitSubmission({
        visibility: "shared",
        payerMemberId: ME,
        selectedMemberIds: [ME, OTHER],
        everyone: true,
      }),
    ).toEqual({ splittable: true, splitEveryone: true, splitMemberIds: [] });
  });

  it("一部なら選んだ人をそのまま残す", () => {
    expect(
      deriveSplitSubmission({
        visibility: "shared",
        payerMemberId: ME,
        selectedMemberIds: [ME, OTHER],
        everyone: false,
      }),
    ).toEqual({
      splittable: true,
      splitEveryone: false,
      splitMemberIds: [ME, OTHER],
    });
  });

  it("private は割り勘できない（DB の CHECK 制約と同じ）", () => {
    expect(
      deriveSplitSubmission({
        visibility: "private",
        payerMemberId: ME,
        selectedMemberIds: [ME, OTHER],
        everyone: false,
      }),
    ).toEqual({ splittable: false, splitEveryone: true, splitMemberIds: [] });
  });
});
