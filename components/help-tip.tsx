import type { ReactNode } from "react";

// 「?」ホバー/フォーカスで出る小さなツールチップ。旅行内（予定の追加方法・精算通貨など）と
// 同一仕様を一箇所にまとめたもの。align で吹き出しの寄せ方向、widthClass で幅を調整。
export function HelpTip({
  label,
  align = "left",
  widthClass = "w-56",
  children,
}: {
  label: string; // 「?」の aria-label
  align?: "left" | "right";
  widthClass?: string;
  children: ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        role="img"
        aria-label={label}
        className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-muted-foreground"
      >
        ?
      </span>
      <span
        className={`pointer-events-none absolute bottom-full ${
          align === "right" ? "right-0" : "left-0"
        } z-10 mb-1 ${widthClass} rounded-md bg-zinc-800 px-2 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100`}
      >
        {children}
      </span>
    </span>
  );
}
