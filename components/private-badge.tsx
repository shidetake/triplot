import { cn } from "@/lib/utils";

// private な場所/費用の名前の隣に出す「プライベート」可視性バッジ。
// design-guidelines「定型部品」インラインバッジのレシピ＋文言を1ソース化する
// （expense-list / place-list / place-popups で逐語コピーされていたのを集約）。
// font-normal を内包し、見出し（font-semibold）の隣に置いても太らない。
// レイアウト（`shrink-0` 等）は className で渡す。
export function PrivateBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "rounded bg-zinc-100 px-1.5 text-xs font-normal text-muted-foreground",
        className,
      )}
    >
      プライベート
    </span>
  );
}
