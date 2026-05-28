// メンバー色のパレット。trip_members.color に palette token を入れる。
// SQL 側の pick_member_color と配列を揃えること。
//
// 設計:
//  - 自動割当: 既存色 + 確定 green からの色相距離が最大の色を選ぶ
//    (lib では rendering のみ; 割当ロジックは SQL 側 pick_member_color)
//  - 緑系 (green / emerald) はパレットから外す
//    → 場所ピンの「確定」ステータス専用に予約
//  - ユーザによる色変更 UI は無し (全て自動)
//  - ダークモード対応時は shade-pair を 100/900 → 900/100 にスワップ
export const MEMBER_COLORS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number];

export function isMemberColor(s: string | null | undefined): s is MemberColor {
  return !!s && (MEMBER_COLORS as readonly string[]).includes(s);
}

// chip 用 bg + text + ring。light shade で背景、濃いめの text。
// Tailwind の JIT に拾われるよう完全文字列で書く（文字列結合は purge 漏れ）。
const CHIP_CLASSES: Record<MemberColor, string> = {
  red: "bg-red-100 text-red-900 ring-1 ring-red-200",
  orange: "bg-orange-100 text-orange-900 ring-1 ring-orange-200",
  amber: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  yellow: "bg-yellow-100 text-yellow-900 ring-1 ring-yellow-200",
  lime: "bg-lime-100 text-lime-900 ring-1 ring-lime-200",
  teal: "bg-teal-100 text-teal-900 ring-1 ring-teal-200",
  cyan: "bg-cyan-100 text-cyan-900 ring-1 ring-cyan-200",
  sky: "bg-sky-100 text-sky-900 ring-1 ring-sky-200",
  blue: "bg-blue-100 text-blue-900 ring-1 ring-blue-200",
  indigo: "bg-indigo-100 text-indigo-900 ring-1 ring-indigo-200",
  violet: "bg-violet-100 text-violet-900 ring-1 ring-violet-200",
  purple: "bg-purple-100 text-purple-900 ring-1 ring-purple-200",
  fuchsia: "bg-fuchsia-100 text-fuchsia-900 ring-1 ring-fuchsia-200",
  pink: "bg-pink-100 text-pink-900 ring-1 ring-pink-200",
  rose: "bg-rose-100 text-rose-900 ring-1 ring-rose-200",
};

// イニシャル円（MemberAvatar）用。chip と同じ light shade で並べた時に揃う。
const AVATAR_CLASSES: Record<MemberColor, string> = {
  red: "bg-red-100 text-red-900",
  orange: "bg-orange-100 text-orange-900",
  amber: "bg-amber-100 text-amber-900",
  yellow: "bg-yellow-100 text-yellow-900",
  lime: "bg-lime-100 text-lime-900",
  teal: "bg-teal-100 text-teal-900",
  cyan: "bg-cyan-100 text-cyan-900",
  sky: "bg-sky-100 text-sky-900",
  blue: "bg-blue-100 text-blue-900",
  indigo: "bg-indigo-100 text-indigo-900",
  violet: "bg-violet-100 text-violet-900",
  purple: "bg-purple-100 text-purple-900",
  fuchsia: "bg-fuchsia-100 text-fuchsia-900",
  pink: "bg-pink-100 text-pink-900",
  rose: "bg-rose-100 text-rose-900",
};

// DB の color は seed/pick で必ず palette 内の値が入る前提。
// 不正値が来たら CSS が当たらず "色なし" になる（QA で気付けるよう敢えて fallback しない）。
export function chipClass(color: string | null | undefined): string {
  return isMemberColor(color) ? CHIP_CLASSES[color] : "";
}

export function avatarClass(color: string | null | undefined): string {
  return isMemberColor(color) ? AVATAR_CLASSES[color] : "";
}

// 表示名から「省略形」を1文字取り出す。Spread でコードポイント単位に分割するので、
// 絵文字 / サロゲートペアでも 1文字として正しく扱える（日本語は元から1コードポイント）。
export function firstChar(name: string | null | undefined): string {
  if (!name) return "?";
  return [...name.trim()][0] ?? "?";
}
