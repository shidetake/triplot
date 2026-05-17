"use client";

import { useState, useTransition } from "react";

import {
  ensureInviteAction,
  regenerateInviteAction,
} from "@/app/trips/[tripId]/actions";

export function InviteSection({
  tripId,
  initialToken,
  baseUrl,
}: {
  tripId: string;
  initialToken: string | null;
  baseUrl: string;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, start] = useTransition();

  const url = token ? `${baseUrl}/join/${token}` : "";

  const run = (
    fn: (id: string) => Promise<{ token: string | null; error: string | null }>,
  ) => {
    setError(null);
    setCopied(false);
    start(async () => {
      const res = await fn(tripId);
      if (res.error || !res.token) {
        setError(res.error ?? "失敗しました");
        return;
      }
      setToken(res.token);
    });
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">
        リンクを知っている人は、ログイン不要（ゲスト）でこの旅行に参加できます。
      </p>

      {!token ? (
        <button
          type="button"
          onClick={() => run(ensureInviteAction)}
          disabled={isPending}
          className="h-9 rounded-md bg-black px-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? "発行中..." : "招待リンクを発行"}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-md border border-zinc-300 px-3 text-xs font-medium transition hover:bg-zinc-50"
            >
              {copied ? "コピー済み" : "コピー"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              if (
                !confirm(
                  "リンクを再生成すると、今までのリンクは使えなくなります。よろしいですか？",
                )
              )
                return;
              run(regenerateInviteAction);
            }}
            disabled={isPending}
            className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline disabled:opacity-50"
          >
            {isPending ? "処理中..." : "リンクを再生成（旧リンクを無効化）"}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>
      )}
    </div>
  );
}
