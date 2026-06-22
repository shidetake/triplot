import { cn } from "@/lib/utils";

import { LockIcon } from "./icons";

// private な場所/費用/予定/TODO の名前の隣に出す可視性インジケータ。
// 「プライベート」テキストだとモバイルで面積を取りすぎるので、世界的に通じる鍵アイコンにする
// （ui-guidelines「文言は極力アイコンに寄せる」）。意味は title（ホバー）＋ aria-label（読み上げ）で担保。
// レイアウト（位置取り等）は className で渡す。色は muted で控えめに（状態の添え物）。
export function PrivateBadge({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="プライベート"
      title="プライベート"
      className={cn("inline-flex shrink-0 text-muted-foreground", className)}
    >
      <LockIcon size={16} />
    </span>
  );
}
