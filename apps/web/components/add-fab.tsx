"use client";

import { Button } from "@/components/ui/button";

import { PlusIcon } from "./icons";

// 狭い画面の「追加」フローティングボタン（iOS の右下の丸い + と同形）。
//
// 広い画面は各画面の見出し行に置いた通常の + を使うので md:hidden。狭い画面は
// 見出し行ごと畳んで中身を画面いっぱいに広げる作りなので、+ をここへ逃がす。
export function AddFab({
  onClick,
  label,
  // タブバーがある画面（旅行詳細）は呼び出し側がその高さぶん持ち上げる。
  // 既定は画面下端から 16px（タブバーの無い旅行一覧）。
  bottom = "calc(env(safe-area-inset-bottom) + 16px)",
}: {
  onClick: (e: React.MouseEvent) => void;
  label: string;
  bottom?: string;
}) {
  return (
    <div className="fixed right-4 z-20 md:hidden" style={{ bottom }}>
      <Button
        type="button"
        size="icon"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="h-12 w-12 rounded-full shadow-lg"
      >
        <PlusIcon size={20} />
      </Button>
    </div>
  );
}
