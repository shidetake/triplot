import { describe, it, expect } from "vitest";

import { GREEN_HUE, pickEventColor } from "./eventColor";

describe("pickEventColor", () => {
  const hues = new Map<string, number | null>([
    ["m1", 50],
    ["m2", 230],
    ["m3", 320],
    ["m4", null], // 色未割当
  ]);

  it("private は常に private", () => {
    expect(
      pickEventColor({
        visibility: "private",
        participantMemberIds: [],
        activeMemberCount: 3,
        memberHueById: hues,
      }),
    ).toEqual({ kind: "private" });
  });

  it("private は参加者数を問わず private（リストにあっても無視）", () => {
    expect(
      pickEventColor({
        visibility: "private",
        participantMemberIds: ["m1"],
        activeMemberCount: 3,
        memberHueById: hues,
      }),
    ).toEqual({ kind: "private" });
  });

  it("空配列＝全員のシュガー → green", () => {
    expect(
      pickEventColor({
        visibility: "shared",
        participantMemberIds: [],
        activeMemberCount: 3,
        memberHueById: hues,
      }),
    ).toEqual({ kind: "green" });
  });

  it("明示的に全 active member 列挙 → green", () => {
    expect(
      pickEventColor({
        visibility: "shared",
        participantMemberIds: ["m1", "m2", "m3"],
        activeMemberCount: 3,
        memberHueById: hues,
      }),
    ).toEqual({ kind: "green" });
  });

  it("1人だけ → そのメンバーの hue", () => {
    expect(
      pickEventColor({
        visibility: "shared",
        participantMemberIds: ["m2"],
        activeMemberCount: 3,
        memberHueById: hues,
      }),
    ).toEqual({ kind: "hue", hue: 230 });
  });

  it("1人だけだが hue 未割当 → mixed にフォールバック", () => {
    expect(
      pickEventColor({
        visibility: "shared",
        participantMemberIds: ["m4"],
        activeMemberCount: 4,
        memberHueById: hues,
      }),
    ).toEqual({ kind: "mixed" });
  });

  it("複数人（全員未満）→ mixed", () => {
    expect(
      pickEventColor({
        visibility: "shared",
        participantMemberIds: ["m1", "m2"],
        activeMemberCount: 3,
        memberHueById: hues,
      }),
    ).toEqual({ kind: "mixed" });
  });

  it("green は確定色 (140°) と同じ hue を期待", () => {
    // pick の戻り値そのものには hue は含めないが、UI 側で GREEN_HUE を使う前提。
    expect(GREEN_HUE).toBe(140);
  });
});
