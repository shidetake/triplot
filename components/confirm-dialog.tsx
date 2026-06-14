"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

// 破壊的操作の確認ダイアログ。素の window.confirm の代替で、見た目を
// triplot のデザイン体系（ライトモード・トークン）に乗せるための共通部品。
// toast() と同じく imperative に呼ぶ:
//
//   if (!(await confirmDialog({ title: "この予定を削除しますか？" }))) return;
//
// <ConfirmDialogHost /> を root layout に1つだけ置く。閉じ方は Esc・背景
// クリック・キャンセルの3経路（design-guidelines「レイヤーと影」「定型部品」）。

type ConfirmOptions = {
  title: string;
  body?: string; // 補足（影響範囲など）。改行は whitespace-pre-line で反映。
  confirmLabel?: string; // 既定 "削除"
  cancelLabel?: string; // 既定 "キャンセル"
  // 破壊的（取り消せない）= 赤枠ボタン。非破壊な確認は false で primary。
  destructive?: boolean; // 既定 true
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let listener: ((p: Pending) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // host 未マウント時は安全側で「キャンセル扱い」にする（誤って破壊しない）。
    if (!listener) {
      resolve(false);
      return;
    }
    listener({ ...opts, resolve });
  });
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  useEffect(() => {
    listener = setPending;
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // close は pending を閉じるだけなので依存は pending のみで十分。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  if (!pending) return null;
  const {
    title,
    body,
    confirmLabel = "削除",
    cancelLabel = "キャンセル",
    destructive = true,
  } = pending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => close(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
      >
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {body && (
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {body}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => close(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "primary"}
            autoFocus
            onClick={() => close(true)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
