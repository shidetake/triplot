import { inputClass } from "@/components/input-class";
import { cn } from "@/lib/utils";

// テキスト入力の共通コンポーネント（ui-guidelines「部品の作り方」①）。
// 中身は native <input> そのもの＝モバイル挙動（キーボード/オートフィル/IME）を
// 捨てない。recipe は inputClass（native <select>・入力風トリガと共有の単一ソース）を
// cn で内包し、className でレイアウト（mt-1 block w-full 等）や上書きを足せる。
// type は呼び出し側で明示（未指定は text）。
// React 19 では ref も通常の prop なので forwardRef 不要（現行 shadcn と同形の
// React.ComponentProps<"input">＝ref を含む全 input 属性を受ける）。
export function Input({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}
