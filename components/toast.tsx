"use client";

import { useEffect, useState } from "react";

// グローバルなトースト。design-guidelines「フィードバック」節の方針:
// 結果が見えない成功（その場編集・コピー）やエラーを、画面下中央に約2.5秒だけ出す。
// どこからでも toast("保存しました") で呼べる（module 越しの pub/sub）。
// <Toaster /> を root layout に1つだけ置く。

type ToastMsg = { id: number; text: string };

let listeners: ((t: ToastMsg) => void)[] = [];
let counter = 0;

export function toast(text: string): void {
  const msg = { id: ++counter, text };
  listeners.forEach((l) => l(msg));
}

export function Toaster() {
  const [current, setCurrent] = useState<ToastMsg | null>(null);

  useEffect(() => {
    const l = (t: ToastMsg) => setCurrent(t);
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent(null), 2500);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;
  return (
    <div
      key={current.id}
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg duration-200"
    >
      {current.text}
    </div>
  );
}
