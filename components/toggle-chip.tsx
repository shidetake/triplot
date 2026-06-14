import { cn } from "@/lib/utils";

// 複数選択のトグルチップ（design-guidelines「定型部品」トグルチップ）。
// 参加者・割り勘対象など「メンバーを丸ごと選ぶ/外す」用途のレシピを1ソース化。
// 選択 = primary 塗り、非選択 = zinc-100 + ring。状態は aria-pressed で公開。
// ラベル・onClick 等は ...props で透過（既定 type="button"）。
export function ToggleChip({
  on,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      {...props}
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs",
        on
          ? "bg-primary text-primary-foreground"
          : "bg-zinc-100 text-subtle-foreground ring-1 ring-foreground/10",
        className,
      )}
    />
  );
}
