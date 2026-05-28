// 予定ブロックの色決定。種別（通常 / 終日 / transit）は区別せず、
// 「参加者の構成」と visibility だけで色を決める。
//
//   private    → 現状のまま zinc（後で詰める。今はプレースホルダ）
//   全員参加   → 確定色と同じ green（hue=140°）
//   1人だけ    → そのメンバーの hue
//   複数〜全員未満 → 現状の slate のまま（後で詰める。今はプレースホルダ）
//
// 「全員参加」のシュガー: `participantMemberIds` が空配列の場合、
// もしくは明示的に全 active member が列挙されている場合の両方を含む。
// （UI 仕様: フォームの "all" モードは空配列で送られる）

export const GREEN_HUE = 140;

export type EventColor =
  | { kind: "private" }
  | { kind: "mixed" } // 複数人だが全員ではない
  | { kind: "green" } // 全員参加
  | { kind: "hue"; hue: number }; // 1人だけ参加（その人の色）

export function pickEventColor(input: {
  visibility: "shared" | "private";
  participantMemberIds: string[];
  activeMemberCount: number;
  memberHueById: Map<string, number | null>;
}): EventColor {
  if (input.visibility === "private") return { kind: "private" };

  const n = input.participantMemberIds.length;
  // 全員: 空配列のシュガー、または明示的に全員列挙のどちらも該当
  if (n === 0 || n === input.activeMemberCount) return { kind: "green" };

  if (n === 1) {
    const hue = input.memberHueById.get(input.participantMemberIds[0]);
    if (typeof hue === "number") return { kind: "hue", hue };
    // 色未割当のメンバーは安全側で mixed と同じ見た目に倒す
    return { kind: "mixed" };
  }

  return { kind: "mixed" };
}

// ─────────────────────────────────────────────────────────
// hue → CSS。トーンはメンバーチップ (chipStyle) と統一。
// 枠線ありブロック（timed / transit）と、枠線なしバー（終日帯）の2系統。
// ─────────────────────────────────────────────────────────

export function eventBlockHueBg(hue: number, hovered: boolean): string {
  // 通常時は chip と同じ s=90 l=92。hover はワントーン濃く。
  return hovered
    ? `hsl(${hue}, 85%, 86%)`
    : `hsl(${hue}, 90%, 92%)`;
}

export function eventBlockHueBorder(hue: number): string {
  return `hsl(${hue}, 80%, 80%)`;
}

export function eventBlockHueText(hue: number): string {
  return `hsl(${hue}, 50%, 25%)`;
}

export function eventBarHueBg(hue: number, hovered: boolean): string {
  // 終日帯は枠なしなので背景をやや濃く（slate-200/300 相当のコントラスト）。
  return hovered
    ? `hsl(${hue}, 80%, 78%)`
    : `hsl(${hue}, 85%, 85%)`;
}

export function eventBarHueText(hue: number): string {
  return `hsl(${hue}, 45%, 25%)`;
}
