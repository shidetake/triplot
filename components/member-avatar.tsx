import { avatarStyle, firstChar } from "@/lib/memberColors";

// メンバーの省略表示。色付きの丸（その人の hue）に表示名の先頭 1 文字を入れる。
// 日本語含む 1 コードポイントが安定して 1 文字として収まるよう、幅・高さは固定、
// 文字サイズも明示。hue は trip_members.color の integer (0-359) を渡す。
//
// 主な用途: TODO のひと、予定の作成者、費用の支払者など「誰がやったか」を一目で
// 識別したい所。チップ（MembersSection）と同じ色トーンで揃えてある。
export function MemberAvatar({
  name,
  color,
  size = "sm",
  className,
}: {
  name: string | null | undefined;
  color: number | null | undefined;
  /** sm = 18px (text-[10px])、md = 24px (text-xs) */
  size?: "sm" | "md";
  className?: string;
}) {
  const dim =
    size === "md"
      ? "h-6 w-6 text-xs"
      : "h-[18px] w-[18px] text-[10px]";
  const label = name?.trim() || undefined;
  return (
    <span
      title={label}
      aria-label={label}
      role={label ? "img" : undefined}
      style={avatarStyle(color)}
      className={[
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium leading-none tracking-tight",
        dim,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span aria-hidden="true">{firstChar(name)}</span>
    </span>
  );
}
