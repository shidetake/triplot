"use client";

import { Button } from "@/components/ui/button";

import { TrashIcon } from "./icons";

// 一覧の行に常に出しておくゴミ箱（TODO・ノート・費用カテゴリ・メンバー）。
//
// **普段は灰色、カーソルを乗せた時だけ赤**（ui-guidelines「ボタンの配色」の
// 行のゴミ箱）。全行に並ぶものを赤くすると、赤が警告ではなく模様になって、
// 普段使わないボタンなのに一番目立つ（Google ドライブ・Notion・GitHub も行の
// ゴミ箱は灰色）。赤は「押したら消える」を押す直前に伝える色として、ホバーの
// 時だけ出す。iOS のスワイプで初めて赤いボタンが出るのと同じ関係。
// タッチの画面にはホバーが無いので灰色のまま（消した後に「元に戻す」が出るか、
// 確認を挟む）。
export function RowDeleteButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="iconDense"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="shrink-0 rounded-full text-muted-foreground hover:bg-red-600/10 hover:text-red-600 dark:hover:text-red-400"
    >
      <TrashIcon size={16} />
    </Button>
  );
}
