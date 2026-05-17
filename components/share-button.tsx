"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  ensureInviteAction,
  regenerateInviteAction,
} from "@/app/trips/[tripId]/actions";

import { type Anchor, FormPopover } from "./form-popover";

export function ShareButton({
  tripId,
  baseUrl,
}: {
  tripId: string;
  baseUrl: string;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const flashToast = (msg: string) => {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2500);
  };

  const copyVia = (
    fn: (id: string) => Promise<{ token: string | null; error: string | null }>,
    okMsg: string,
  ) => {
    start(async () => {
      const res = await fn(tripId);
      if (res.error || !res.token) {
        flashToast(res.error ?? "失敗しました");
        return;
      }
      try {
        await navigator.clipboard.writeText(`${baseUrl}/join/${res.token}`);
      } catch {
        flashToast("コピーに失敗しました");
        return;
      }
      setAnchor(null);
      flashToast(okMsg);
    });
  };

  return (
    <>
      <button
        type="button"
        aria-label="共有"
        onClick={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        className="rounded-md p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M12 15V3" />
          <path d="m8 7 4-4 4 4" />
        </svg>
      </button>

      {anchor && (
        <FormPopover anchor={anchor} onClose={() => setAnchor(null)}>
          <div className="space-y-3 p-4">
            <p className="text-xs text-zinc-500">
              リンクを知っている人はログイン不要（ゲスト）で参加できます。
            </p>
            <button
              type="button"
              onClick={() =>
                copyVia(ensureInviteAction, "リンクをコピーしました")
              }
              disabled={isPending}
              className="h-9 w-full rounded-md bg-black text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {isPending ? "処理中..." : "リンクをコピー"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  !confirm(
                    "リンクを再生成すると、今までのリンクは使えなくなります。よろしいですか？",
                  )
                )
                  return;
                copyVia(
                  regenerateInviteAction,
                  "新しいリンクをコピーしました（旧リンクは無効）",
                );
              }}
              disabled={isPending}
              className="block w-full text-center text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline disabled:opacity-50"
            >
              リンクを再生成（旧リンクを無効化）
            </button>
          </div>
        </FormPopover>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
