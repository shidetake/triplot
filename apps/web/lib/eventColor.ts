// 予定ブロックの色決定。種別（通常 / 終日 / transit）は区別せず、
// 「参加者の構成」と visibility だけで色を決める。閲覧者（自分）視点で変わる
// 点に注意 —— mixed は「自分が参加しているか」で地色が変わる。
//
//   private    → 現状のまま zinc（後で詰める。今はプレースホルダ）
//   全員参加   → 確定色と同じ green（hue=140°）
//   1人だけ    → そのメンバーの hue
//   複数〜全員未満（mixed）→
//       自分が参加 → 自分の hue（各自の画面で違って見える）
//       自分は不参加 → slate（中立）
//     どちらも右肩に参加者ドットを出す（描画側で自分のドットは除外）。
//
// 「全員参加」のシュガー: `participantMemberIds` が空配列の場合、
// もしくは明示的に全 active member が列挙されている場合の両方を含む。
// （UI 仕様: フォームの "all" モードは空配列で送られる）

export const GREEN_HUE = 140;

export type EventColor =
  | { kind: "private" }
  // 複数人だが全員ではない。selfHue=自分が参加かつ色ありなら自分の hue、
  // それ以外（自分不参加 or 色未割当）は null（→ slate 地色）。
  | { kind: "mixed"; selfHue: number | null }
  | { kind: "green" } // 全員参加
  | { kind: "hue"; hue: number }; // 1人だけ参加（その人の色）

export function pickEventColor(input: {
  visibility: "shared" | "private";
  participantMemberIds: string[];
  activeMemberCount: number;
  memberHueById: Map<string, number | null>;
  myMemberId: string;
}): EventColor {
  if (input.visibility === "private") return { kind: "private" };

  const n = input.participantMemberIds.length;
  // 全員: 空配列のシュガー、または明示的に全員列挙のどちらも該当
  if (n === 0 || n === input.activeMemberCount) return { kind: "green" };

  if (n === 1) {
    const hue = input.memberHueById.get(input.participantMemberIds[0]);
    if (typeof hue === "number") return { kind: "hue", hue };
    // 色未割当のメンバーは安全側で mixed（slate 地色）に倒す
    return { kind: "mixed", selfHue: null };
  }

  // mixed: 自分が参加していれば自分の hue を地色に。
  const includesMe = input.participantMemberIds.includes(input.myMemberId);
  const myHue = includesMe ? input.memberHueById.get(input.myMemberId) : null;
  return {
    kind: "mixed",
    selfHue: typeof myHue === "number" ? myHue : null,
  };
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

export function eventHueSelectedBorder(hue: number): string {
  // 選択中の強調枠。地色と同じ hue のまま濃く・太くする（黒枠は地色と
  // 無関係な色が乗って野暮ったく、別色はメンバー色と衝突しうるため）。
  return `hsl(${hue}, 65%, 50%)`;
}
