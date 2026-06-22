import { chipStyle } from "@/lib/memberColors";
import { cn } from "@/lib/utils";

// 複数選択のトグルチップ（ui-guidelines「定型部品」トグルチップ）。
// 参加者・割り勘対象・支払者など「メンバーを選ぶ/外す」用途のレシピを1ソース化。
// 非選択 = zinc-100 + ring。選択は2系統:
//   - hue を渡す（メンバー選択）→ そのメンバー色（chipStyle＝アバター/メンバーチップと同じ
//     薄い面）。誰を選んでいるかが色で分かる。
//   - hue 無し → primary 塗り（中立な ON/OFF トグル）。
// 状態は aria-pressed で公開。ラベル・onClick 等は ...props で透過（既定 type="button"）。
export function ToggleChip({
  on,
  hue,
  className,
  style,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  on: boolean;
  hue?: number | null;
}) {
  const memberStyle = on && hue != null ? chipStyle(hue) : null;
  // hue が無効（範囲外/NULL）だと chipStyle は空を返す → primary にフォールバック。
  const colored = memberStyle?.backgroundColor != null;
  return (
    <button
      type="button"
      aria-pressed={on}
      {...props}
      style={colored ? { ...memberStyle, ...style } : style}
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs",
        on
          ? colored
            ? "" // 色は chipStyle の inline style で当てる
            : "bg-primary text-primary-foreground"
          : "bg-zinc-100 text-subtle-foreground ring-1 ring-foreground/10",
        className,
      )}
    />
  );
}
