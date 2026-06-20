import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// セマンティックなメッセージ面（design-guidelines「セマンティック色」）。
// error=赤（操作が失敗・進めない）/ warning=amber（進めるが要注意）。面の色＋文字色を
// 1ソース化（bg-red-50 text-red-700 等を各所で逐語コピーしていたのを集約）。
//
// dense=密な場所（吹き出し内など）は小さめ（rounded p-2 text-xs）、既定は標準
// （rounded-md p-3 text-sm）。フォーム送信失敗・該当箇所近くのインライン表示に使う
// （トーストではなく「どの入力が問題か」が分かる場所に出す方針）。
const KIND = {
  error: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-800",
} as const;

export function MessageBox({
  kind,
  dense,
  className,
  children,
}: {
  kind: keyof typeof KIND;
  dense?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        dense ? "rounded p-2 text-xs" : "rounded-md p-3 text-sm",
        KIND[kind],
        className,
      )}
    >
      {children}
    </p>
  );
}
