// メンバー色のパレット。DB の trip_members.color に palette token を入れる。
// SQL 側の pick_member_color と同じ順序で揃えること（auto 割当の挙動を
// クライアント側で見せ方含めて予測しやすくするため）。
export const MEMBER_COLORS = [
  "blue",
  "emerald",
  "amber",
  "rose",
  "violet",
  "sky",
  "orange",
  "teal",
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number];

export function isMemberColor(s: string | null | undefined): s is MemberColor {
  return !!s && (MEMBER_COLORS as readonly string[]).includes(s);
}

// chip 用の bg + text + ring クラス。light shade で背景、濃いめの text。
// 各色は名前で固定なので Tailwind の JIT に拾われるよう完全文字列で書く
// （文字列結合では purge 漏れする）。
const CHIP_CLASSES: Record<MemberColor, string> = {
  blue: "bg-blue-100 text-blue-900 ring-1 ring-blue-200",
  emerald: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
  amber: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  rose: "bg-rose-100 text-rose-900 ring-1 ring-rose-200",
  violet: "bg-violet-100 text-violet-900 ring-1 ring-violet-200",
  sky: "bg-sky-100 text-sky-900 ring-1 ring-sky-200",
  orange: "bg-orange-100 text-orange-900 ring-1 ring-orange-200",
  teal: "bg-teal-100 text-teal-900 ring-1 ring-teal-200",
};

// 色 swatch (picker のドット) 用の塗りクラス。
const SWATCH_CLASSES: Record<MemberColor, string> = {
  blue: "bg-blue-400",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
  violet: "bg-violet-400",
  sky: "bg-sky-400",
  orange: "bg-orange-400",
  teal: "bg-teal-400",
};

// イニシャル円（MemberAvatar）用。chip と同じ light shade + 濃いめ text で
// 並べた時に違和感ないトーンに。
const AVATAR_CLASSES: Record<MemberColor, string> = {
  blue: "bg-blue-100 text-blue-900",
  emerald: "bg-emerald-100 text-emerald-900",
  amber: "bg-amber-100 text-amber-900",
  rose: "bg-rose-100 text-rose-900",
  violet: "bg-violet-100 text-violet-900",
  sky: "bg-sky-100 text-sky-900",
  orange: "bg-orange-100 text-orange-900",
  teal: "bg-teal-100 text-teal-900",
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
