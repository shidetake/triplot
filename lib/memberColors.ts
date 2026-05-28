// メンバー色のパレット。DB の trip_members.color に palette token を入れる。
// SQL 側の pick_member_color と同じ順序で揃えること（auto 割当の挙動を
// クライアント側で見せ方含めて予測しやすくするため）。
//
// 設計方針:
//  - 色相環で互いに最大距離を取った 6 色（同系統重複なし）
//  - 緑系は意図的に外す → 確定ステータス (place_statuses) で緑系を使うため
//  - ダークモード対応時は shade-pair を 100/900 → 900/100 にスワップ
//    すれば成立（色相変更は不要）
export const MEMBER_COLORS = [
  "red",
  "amber",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number];

export function isMemberColor(s: string | null | undefined): s is MemberColor {
  return !!s && (MEMBER_COLORS as readonly string[]).includes(s);
}

// chip 用の bg + text + ring クラス。light shade で背景、濃いめの text。
// 各色は名前で固定なので Tailwind の JIT に拾われるよう完全文字列で書く
// （文字列結合では purge 漏れする）。
const CHIP_CLASSES: Record<MemberColor, string> = {
  red: "bg-red-100 text-red-900 ring-1 ring-red-200",
  amber: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  teal: "bg-teal-100 text-teal-900 ring-1 ring-teal-200",
  blue: "bg-blue-100 text-blue-900 ring-1 ring-blue-200",
  violet: "bg-violet-100 text-violet-900 ring-1 ring-violet-200",
  pink: "bg-pink-100 text-pink-900 ring-1 ring-pink-200",
};

// 色 swatch (picker のドット) 用の塗りクラス。
const SWATCH_CLASSES: Record<MemberColor, string> = {
  red: "bg-red-400",
  amber: "bg-amber-400",
  teal: "bg-teal-400",
  blue: "bg-blue-400",
  violet: "bg-violet-400",
  pink: "bg-pink-400",
};

// イニシャル円（MemberAvatar）用。chip と同じ light shade + 濃いめ text で
// 並べた時に違和感ないトーンに。
const AVATAR_CLASSES: Record<MemberColor, string> = {
  red: "bg-red-100 text-red-900",
  amber: "bg-amber-100 text-amber-900",
  teal: "bg-teal-100 text-teal-900",
  blue: "bg-blue-100 text-blue-900",
  violet: "bg-violet-100 text-violet-900",
  pink: "bg-pink-100 text-pink-900",
};

const FALLBACK_CHIP = "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200";
const FALLBACK_AVATAR = "bg-zinc-200 text-zinc-700";

export function chipClass(color: string | null | undefined): string {
  return isMemberColor(color) ? CHIP_CLASSES[color] : FALLBACK_CHIP;
}

export function swatchClass(color: MemberColor): string {
  return SWATCH_CLASSES[color];
}

export function avatarClass(color: string | null | undefined): string {
  return isMemberColor(color) ? AVATAR_CLASSES[color] : FALLBACK_AVATAR;
}

// 表示名から「省略形」を1文字取り出す。Spread でコードポイント単位に分割するので、
// 絵文字 / サロゲートペアでも 1文字として正しく扱える（日本語は元から1コードポイント）。
export function firstChar(name: string | null | undefined): string {
  if (!name) return "?";
  return [...name.trim()][0] ?? "?";
}
