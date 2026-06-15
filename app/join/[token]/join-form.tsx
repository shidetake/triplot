"use client";

import { useState, useTransition } from "react";

import { FieldLabel } from "@/components/field-label";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        <FieldLabel>あなたの表示名（この旅行内）</FieldLabel>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ゲスト"
          className="mt-1 block w-full min-w-0"
        />
      </label>

      {hasSession ? (
        <Button type="button" onClick={joinDirect} disabled={isPending} className="h-11 w-full">
          {isPending ? "参加中..." : "この旅行に参加する"}
        </Button>
      ) : (
        <div className="space-y-3">
          <Button type="button" onClick={joinAsGuest} disabled={isPending} className="h-11 w-full">
            {isPending ? "参加中..." : "ゲストとして参加（ログイン不要）"}
          </Button>
          <div className="flex items-center gap-3 text-xs text-subtle-foreground">
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
