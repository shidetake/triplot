"use client";

import { Popover } from "@base-ui/react/popover";

export type Anchor = { x: number; y: number };

// クリック位置の近くに出すポップオーバー。予定追加・費用追加など入力フォームを
// 同じ見た目で出すための共通部品。開閉・外側クリック・Esc・はみ出し回避の位置決めは
// Base UI Popover に委ねる（design-guidelines「部品の作り方」step2）。
// クリック座標を virtual anchor にして、その点を基準に開く（トリガ要素は無い）。
// 非 modal（フォーカスを閉じ込めない）= 中の DatePopover 等ネストした popover や
// 自由なスクロールを邪魔しない。外側クリック／Esc では閉じる。
export function FormPopover({
  anchor,
  onClose,
  children,
  label,
}: {
  anchor: Anchor;
  onClose: () => void;
  children: React.ReactNode;
  // 渡すと dialog のアクセシブル名にする。
  label?: string;
}) {
  const virtualAnchor = {
    getBoundingClientRect: () =>
      ({
        x: anchor.x,
        y: anchor.y,
        width: 0,
        height: 0,
        top: anchor.y,
        left: anchor.x,
        right: anchor.x,
        bottom: anchor.y,
      }) as DOMRect,
  };

  return (
    <Popover.Root
      open
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={virtualAnchor}
          side="bottom"
          align="start"
          alignOffset={8}
          sideOffset={0}
          className="z-50"
        >
          <Popover.Popup
            aria-label={label}
            className="max-h-[80vh] w-[22rem] overflow-y-auto rounded-lg border border-foreground/20 bg-white shadow-xl outline-none"
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
