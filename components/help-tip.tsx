"use client";

import type { ReactNode } from "react";

import { Popover } from "@base-ui/react/popover";

// 「?」ヒント。**ホバー（PC）でもタップ（モバイル）でも開く**。
// 以前は Base UI Tooltip だったが、Tooltip はホバー/フォーカス前提でタップでは開かない
// （base-ui の更新でタップ時の focus 開きも効かなくなった）。openOnHover を付けた Popover に
// すると、ホバー＝ツールチップ風／クリック・タップ＝ポップオーバー風、の両対応になる。
// 殻（開閉・外側クリック・Esc・はみ出し位置決め・a11y）は Base UI Popover に委ねる
// （ui-guidelines「部品の作り方」step2）。
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
    <Popover.Root modal={false}>
      <Popover.Trigger
        // ホバー（PC）でも開く。モバイルはタップ（Popover 既定のクリック開き）で開く。
        openOnHover
        delay={150}
        // フォーム内にも置かれるので type=button 必須（既定 submit を避ける）。
        type="button"
        aria-label={label}
        className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-muted-foreground"
      >
        ?
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          align={align === "right" ? "end" : "start"}
          sideOffset={4}
          className="z-50"
        >
          <Popover.Popup
            className={`${widthClass} rounded-md bg-primary px-2 py-1.5 text-xs leading-snug text-primary-foreground shadow-lg transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0`}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
