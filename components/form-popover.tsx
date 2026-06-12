"use client";

import { useLayoutEffect, useRef, useState } from "react";

export type Anchor = { x: number; y: number };

// クリック位置の近くに出すポップオーバー。背景クリックで閉じ、画面外に
// はみ出さないようマウント後に実寸を測ってクランプする。予定追加・費用追加
// など入力フォームを同じ見た目で出すための共通部品。
export function FormPopover({
  anchor,
  onClose,
  children,
}: {
  anchor: Anchor;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: anchor.x,
    top: anchor.y,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // モード切替などで中身の高さが変わると下にはみ出して下端のボタンが
    // 押せなくなるので、サイズ変化のたびに測り直してクランプする。
    const clamp = () => {
      const pad = 8;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.max(pad, Math.min(anchor.x + 8, vw - w - pad));
      const top = Math.max(pad, Math.min(anchor.y, vh - h - pad));
      setPos({ left, top });
    };
    clamp();
    const ro = new ResizeObserver(clamp);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor.x, anchor.y]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        className="fixed z-50 max-h-[80vh] w-[22rem] overflow-y-auto rounded-lg border border-foreground/20 bg-white shadow-xl"
        style={{ left: pos.left, top: pos.top }}
      >
        {children}
      </div>
    </>
  );
}
