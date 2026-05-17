"use client";

import { useState, useTransition } from "react";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { createClient } from "@/lib/supabase/client";

import { joinAction } from "./actions";

export function JoinForm({
  token,
  defaultName,
  hasSession,
}: {
  token: string;
  defaultName: string;
  hasSession: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const submitJoin = () => {
    start(async () => {
      const { error } = await joinAction(token, name);
      // 成功時は joinAction 内で redirect されるためここには戻らない
      if (error) setError(error);
    });
  };

  // 既ログイン（匿名含む）: 名前を確認して参加するだけ
  const joinDirect = () => {
    setError(null);
    submitJoin();
  };

  // 未ログイン: 匿名サインイン → 参加
  const joinAsGuest = () => {
    setError(null);
    start(async () => {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) {
        setError(
          "ゲスト参加が無効になっています。Google で参加してください。",
        );
        return;
      }
      const { error } = await joinAction(token, name);
      if (error) setError(error);
    });
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="font-medium">あなたの表示名（この旅行内）</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ゲスト"
          className="mt-1 block w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
      </label>

      {hasSession ? (
        <button
          type="button"
          onClick={joinDirect}
          disabled={isPending}
          className="h-11 w-full rounded-md bg-black font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? "参加中..." : "この旅行に参加する"}
        </button>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={joinAsGuest}
            disabled={isPending}
            className="h-11 w-full rounded-md bg-black font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
          >
            {isPending ? "参加中..." : "ゲストとして参加（ログイン不要）"}
          </button>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200" />
            または
            <span className="h-px flex-1 bg-zinc-200" />
          </div>
          <GoogleSignInButton next={`/join/${token}`} />
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
