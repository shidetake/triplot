import { cn } from "@/lib/utils";

// 横に並ぶ複数要素の区切り（縦棒）。アイコンではなく 1px 幅のボーダー罫線
// （前景色の α 階段＝`foreground/10`、ui-guidelines「ボーダー色」の仕切り段）。
// flex の items-center 行で要素間に置く（インラインテキスト中でも inline-block で効く）。
// 区切りそのものは意味を持たないので aria-hidden（読み上げは左右の要素で足りる）。
// 高さ・余白は文脈で変えられるよう className で上書き可（既定 h-3.5）。
export function InlineDivider({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-3.5 w-px shrink-0 bg-foreground/10 align-middle",
        className,
      )}
    />
  );
}
