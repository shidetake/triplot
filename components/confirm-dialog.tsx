"use client";

import { useEffect, useRef, useState } from "react";

import { Dialog } from "@base-ui/react/dialog";

import { Button } from "@/components/ui/button";

// 破壊的操作の確認ダイアログ。素の window.confirm の代替で、見た目を
// triplot のデザイン体系（ライトモード・トークン）に乗せるための共通部品。
// toast() と同じく imperative に呼ぶ:
//
//   if (!(await confirmDialog({ title: "この予定を削除しますか？" }))) return;
//
// <ConfirmDialogHost /> を root layout に1つだけ置く。モーダルの開閉・フォーカス
// トラップ・Esc・背景クリックは Base UI Dialog に委ねる（ui-guidelines
// 「部品の作り方」step2＝native 相当の無いダイアログは shadcn/Base UI）。

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
  // opts は閉じアニメーション中も内容を保持するため open と分けて持つ。
  const [opts, setOpts] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    listener = (p) => {
      setOpts(p);
      setOpen(true);
    };
    return () => {
      listener = null;
    };
  }, []);

  // ok を resolve して閉じる。opts のクリアは閉じ切ってから（onOpenChangeComplete）。
  const close = (ok: boolean) => {
    opts?.resolve(ok);
    setOpen(false);
  };

  const {
    title = "",
    body,
    confirmLabel = "削除",
    cancelLabel = "キャンセル",
    destructive = true,
  } = opts ?? {};

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Esc・背景クリックでの閉じ（next=false）はキャンセル扱い。
        if (!next) close(false);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) setOpts(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup
          initialFocus={confirmRef}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl outline-none"
        >
          <Dialog.Title className="text-sm font-semibold text-foreground">
            {title}
          </Dialog.Title>
          {body && (
            <Dialog.Description className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {body}
            </Dialog.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              {cancelLabel}
            </Button>
            <Button
              ref={confirmRef}
              type="button"
              variant={destructive ? "destructive" : "primary"}
              onClick={() => close(true)}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
