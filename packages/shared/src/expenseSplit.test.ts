import { describe, expect, it } from "vitest";

import {
  deriveSplitSelection,
  deriveSplitSubmission,
} from "./expenseSplit";

const ME = "me";
const OTHER = "other";
const THIRD = "third";
const MEMBERS = [ME, OTHER, THIRD];

describe("deriveSplitSubmission", () => {
  it("払った人が自分のためだけに払ったなら、割り勘しない", () => {
    expect(
      deriveSplitSubmission({
        visibility: "shared",
        payerMemberId: ME,
        selectedMemberIds: [ME],
        everyone: false,
        activeMemberIds: MEMBERS,
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
        activeMemberIds: MEMBERS,
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
        selectedMemberIds: MEMBERS,
        everyone: true,
        activeMemberIds: MEMBERS,
      }),
    ).toEqual({ splittable: true, splitEveryone: true, splitMemberIds: [] });
  });

  // 実データで起きていたケース。畳んだ「全員」を確かめようと開くと一部モードに
  // 変わり、全員が選ばれたまま保存すると ID が焼き込まれていた（表示は「全員」の
  // まま）。結果が全員なら「全員」として保存する。
  it("一部モードでも、結果が全員なら「全員」として保存する", () => {
    expect(
      deriveSplitSubmission({
        visibility: "shared",
        payerMemberId: ME,
        selectedMemberIds: MEMBERS,
        everyone: false,
        activeMemberIds: MEMBERS,
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
        activeMemberIds: MEMBERS,
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
        selectedMemberIds: MEMBERS,
        everyone: false,
        activeMemberIds: MEMBERS,
      }),
    ).toEqual({ splittable: false, splitEveryone: true, splitMemberIds: [] });
  });
});

describe("deriveSplitSelection", () => {
  const members = ["me", "a", "b"];

  it("自分のためだけに払った費用は「自分のみ」に戻す（全員に化けない）", () => {
    // splittable=false の費用は split_everyone=true で保存されている。
    expect(
      deriveSplitSelection({
        splittable: false,
        splitEveryone: true,
        splitMemberIds: [],
        payerMemberId: "me",
        activeMemberIds: members,
      }),
    ).toEqual({ mode: "custom", selectedMemberIds: ["me"] });
  });

  it("全員の割り勘は、開いた時点のアクティブメンバーに解決する", () => {
    expect(
      deriveSplitSelection({
        splittable: true,
        splitEveryone: true,
        splitMemberIds: [],
        payerMemberId: "me",
        activeMemberIds: members,
      }),
    ).toEqual({ mode: "all", selectedMemberIds: members });
  });

  it("一部の割り勘は、保存された対象をそのまま戻す", () => {
    expect(
      deriveSplitSelection({
        splittable: true,
        splitEveryone: false,
        splitMemberIds: ["me", "a"],
        payerMemberId: "me",
        activeMemberIds: members,
      }),
    ).toEqual({ mode: "custom", selectedMemberIds: ["me", "a"] });
  });

  it("保存 → 復元 → 保存で値が変わらない", () => {
    const cases = [
      { everyone: false, selectedMemberIds: ["me"] }, // 自分のためだけ
      { everyone: true, selectedMemberIds: members }, // 全員
      { everyone: false, selectedMemberIds: members }, // 一部モードで全員
      { everyone: false, selectedMemberIds: ["me", "a"] }, // 一部
    ];
    for (const c of cases) {
      const saved = deriveSplitSubmission({
        visibility: "shared",
        payerMemberId: "me",
        activeMemberIds: members,
        ...c,
      });
      const back = deriveSplitSelection({
        ...saved,
        payerMemberId: "me",
        activeMemberIds: members,
      });
      const again = deriveSplitSubmission({
        visibility: "shared",
        payerMemberId: "me",
        activeMemberIds: members,
        selectedMemberIds: back.selectedMemberIds,
        everyone: back.mode === "all",
      });
      expect(again).toEqual(saved);
    }
  });
});
