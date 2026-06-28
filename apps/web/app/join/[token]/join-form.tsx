"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { FieldLabel } from "@/components/field-label";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { MessageBox } from "@/components/message-box";
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
  const t = useTranslations("join");
  const tc = useTranslations("common");

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
        setError(t("guestDisabled"));
        return;
      }
      const { error } = await joinAction(token, name);
      if (error) setError(error);
    });
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <FieldLabel>{t("displayNameLabel")}</FieldLabel>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("guestPlaceholder")}
          className="mt-1 block w-full min-w-0"
        />
      </label>

      {hasSession ? (
        <Button type="button" onClick={joinDirect} disabled={isPending} className="h-11 w-full">
          {isPending ? t("joining") : t("joinTrip")}
        </Button>
      ) : (
        <div className="space-y-3">
          <Button type="button" onClick={joinAsGuest} disabled={isPending} className="h-11 w-full">
            {isPending ? t("joining") : t("joinAsGuest")}
          </Button>
          <div className="flex items-center gap-3 text-xs text-subtle-foreground">
            <span className="h-px flex-1 bg-foreground/10" />
            {tc("or")}
            <span className="h-px flex-1 bg-foreground/10" />
          </div>
          <GoogleSignInButton next={`/join/${token}`} />
        </div>
      )}

      {error && (
        <MessageBox kind="error">{error}</MessageBox>
      )}
    </div>
  );
}
