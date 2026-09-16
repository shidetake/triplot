"use client";

import type { ReactNode } from "react";

import { CloseButton } from "./close-button";
import { useInSheet } from "./form-host";
import { cn } from "@/lib/utils";

/**
 * ポップアップ（広い画面）のフォーム/吹き出しの**先頭行**。× を行の最後の要素として
 * 並べ、負のマージンで器の角（上右 8px）へ寄せる。
 *
 * × を絶対配置で重ねると、先頭の要素が下に潜らないよう1つずつ右クリアランスを
 * 入れて回ることになり、**足すたびに忘れる**（予定・費用・旅行の編集で実際に
 * 抜けていて、タイトル入力や通貨セレクトに × が重なっていた）。行の一員にすれば
 * flex が場所を作るので、逃がす作業そのものが要らない。× は入力より背が低いので
 * 行は増えない。
 *
 * `onClose` を渡さない時とボトムシートの中では、中身をそのまま返す（シートは
 * 下スワイプで閉じるので × を出さない）。
 */
export function FormCloseRow({
  onClose,
  className,
  children,
}: {
  onClose?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const inSheet = useInSheet();
  if (inSheet || !onClose) return <>{children}</>;
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <div className="min-w-0 flex-1">{children}</div>
      <CloseButton onClick={onClose} className="-mr-2 -mt-2 shrink-0" />
    </div>
  );
}
