import { cn } from "@/lib/utils";

import { CloseIcon } from "./icons";

// ポップアップ/フォーム右上の × 閉じるボタン（design-guidelines「定型部品」）。
// subtle 色・rounded-full・h-6 の独自レシピを1ソース化。label は読み上げ/ツールチップ
// （既定「閉じる」）。位置調整は className で渡す（place-popups の負マージン等）。
export function CloseButton({
  onClick,
  label = "閉じる",
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full text-subtle-foreground transition hover:bg-foreground/10 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <CloseIcon size={16} />
    </button>
  );
}
