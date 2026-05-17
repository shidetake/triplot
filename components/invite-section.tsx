"use client";

import { useState, useTransition } from "react";

import { createInviteAction } from "@/app/trips/[tripId]/actions";

export function InviteSection({ tripId }: { tripId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, start] = useTransition();

  const issue = () => {
    setError(null);
    setCopied(false);
    start(async () => {
      const { token, error } = await createInviteAction(tripId);
      if (error || !token) {
        setError(error ?? "発行に失敗しました");
        return;
      }
      setUrl(`${window.location.origin}/join/${token}`);
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

      <button
        type="button"
        onClick={issue}
        disabled={isPending}
        className="h-9 rounded-md bg-black px-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
      >
        {isPending
          ? "発行中..."
          : url
            ? "新しいリンクを発行"
            : "招待リンクを発行"}
      </button>

      {url && (
        <div className="space-y-1">
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
          <p className="text-xs text-zinc-500">
            このリンクは一度しか表示されません。発行するたびに別のリンクになります（古いリンクも有効）。
          </p>
        </div>
      )}

      {error && (
        <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>
      )}
    </div>
  );
}
