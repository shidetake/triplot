import { avatarClass, firstChar } from "@/lib/memberColors";

// メンバーの省略表示。色付きの丸（その人の MemberColor）に表示名の先頭 1 文字を
// 入れる。日本語含む 1 コードポイントが安定して 1 文字として収まるよう、幅・高さ
// は固定、文字サイズも明示。色未割当（既存データなど）は zinc グレーにフォールバック。
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
  color: string | null | undefined;
  /** sm = 18px (text-[10px])、md = 24px (text-xs) */
  size?: "sm" | "md";
  className?: string;
}) {
  const dim =
    size === "md"
      ? "h-6 w-6 text-xs"
      : "h-[18px] w-[18px] text-[10px]";
  return (
    <span
      aria-hidden="true"
      className={[
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium leading-none tracking-tight",
        dim,
        avatarClass(color),
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {firstChar(name)}
    </span>
  );
}
