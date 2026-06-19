"use client";

import type { ReactNode } from "react";

import { Tooltip } from "@base-ui/react/tooltip";

// 「?」ホバー/フォーカスで出る小さなツールチップ。旅行内（予定の追加方法・精算通貨など）と
// 同一仕様を一箇所にまとめたもの。align で吹き出しの寄せ方向、widthClass で幅を調整。
//
// 殻（開閉・ホバー/フォーカス/タッチ・Esc・aria-describedby 連携・はみ出し回避の位置決め）は
// Base UI Tooltip に委ねる（design-guidelines「部品の作り方」step2）。遅延は root の
// Tooltip.Provider が共有する。
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
    <Tooltip.Root>
      <Tooltip.Trigger
        // フォーム内にも置かれるので type=button 必須（既定 submit を避ける）。
        type="button"
        aria-label={label}
        className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-muted-foreground"
      >
        ?
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner
          side="top"
          align={align === "right" ? "end" : "start"}
          sideOffset={4}
          className="z-50"
        >
          <Tooltip.Popup
            className={`${widthClass} rounded-md bg-zinc-800 px-2 py-1.5 text-xs leading-snug text-white shadow-lg transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0`}
          >
            {children}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
