import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// triplot のボタン。ui-guidelines「ボタンの配色」の役割を variant で実装。
// 角丸は rounded-md（入力欄＝コントロールと揃える）、フォーカスは
// `focus-visible:ring`（キーボード操作時だけリングを出す＝a11y）。
// type は付けない（呼び出し側で type="button"/"submit" を明示。未指定だと
// ブラウザ既定の submit になるため）。
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-md font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Primary: その UI の主目的を完了/送信する1動作（保存・追加・確定）
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        // Destructive: 破壊的・取り消せない（削除）。赤枠（塗りでなく）
        destructive:
          "border border-red-600/20 text-red-600 hover:bg-red-600/10",
        // Neutral/Navigate: 補助・キャンセル・取得（白枠）
        outline:
          "border border-foreground/20 text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
        // Ghost: 枠なしの単独アイコン操作子（ツールバー・×閉じる等）
        ghost: "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
      },
      size: {
        default: "h-9 px-4 text-sm", // テキストボタン標準
        sm: "h-8 px-3 text-xs", // 小
        icon: "h-9 w-9", // アイコンのみ（標準）
        iconSm: "h-8 w-8", // アイコンのみ（小）
        iconDense: "h-7 w-7", // 密なリスト内
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
