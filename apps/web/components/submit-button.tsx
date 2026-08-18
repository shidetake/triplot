"use client";

import { Button } from "@/components/ui/button";
import { useDelayedBusy } from "@/components/use-delayed-busy";

// フォームの送信ボタン。処理が閾値より長引いた時だけ、中身を同じ寸法の
// インジケータに差し替える（規約は docs/ui-guidelines.md の「処理中
// （ローディング）」＝ボタン内インジケータが第一選択、速い処理には何も
// 出さない）。RN 側の対は apps/mobile/src/components/submit-button.tsx。
//
// busy と disabled は別に受ける: 必須が埋まっていない間も押せなくするが、
// その時はインジケータを出さない（処理していないため）。
export function SubmitButton({
  busy = false,
  disabled = false,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { busy?: boolean }) {
  const showBusy = useDelayedBusy(busy);

  return (
    <Button
      type="submit"
      disabled={busy || disabled}
      aria-busy={busy || undefined}
      {...props}
    >
      {showBusy ? <BusyIndicator /> : children}
    </Button>
  );
}

// ボタンの中に収まる輪。アイコン（20px）と同じ寸法にして、差し替わっても
// ボタンの中身の大きさが動かないようにする。
function BusyIndicator() {
  return (
    <span
      aria-hidden
      className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-pulse"
    />
  );
}
