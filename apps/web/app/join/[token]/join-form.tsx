"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { FieldLabel } from "@/components/field-label";
import { OAuthSignInButton } from "@/components/oauth-sign-in-button";
import { MessageBox } from "@/components/message-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthProvider } from "@/lib/lastAuthProvider";
import { createClient } from "@/lib/supabase/client";

import { joinAction } from "./actions";
import { hardRedirect } from "./hard-redirect";

export function JoinForm({
  token,
  defaultName,
  hasSession,
  lastAuthProvider,
}: {
  token: string;
  defaultName: string;
  hasSession: boolean;
  lastAuthProvider: AuthProvider | null;
}) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const t = useTranslations("join");
  const tc = useTranslations("common");

  // 参加成功後の遷移は hard-redirect.tsx に集約（理由もそちらのコメント参照）。
  const finishJoin = (result: Awaited<ReturnType<typeof joinAction>>) => {
    if ("error" in result) {
      setError(result.error);
      return;
    }
    hardRedirect(`/trips/${result.tripId}`);
  };

  const submitJoin = () => {
    start(async () => {
      finishJoin(await joinAction(token, name));
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
      finishJoin(await joinAction(token, name));
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
        <Button
          type="button"
          onClick={joinDirect}
          disabled={isPending}
          className="h-11 w-full"
        >
          {isPending ? t("joining") : t("joinTrip")}
        </Button>
      ) : (
        <div className="space-y-3">
          <Button
            type="button"
            onClick={joinAsGuest}
            disabled={isPending}
            className="h-11 w-full"
          >
            {isPending ? t("joining") : t("joinAsGuest")}
          </Button>
          <div className="flex items-center gap-3 text-xs text-subtle-foreground">
            <span className="h-px flex-1 bg-foreground/10" />
            {tc("or")}
            <span className="h-px flex-1 bg-foreground/10" />
          </div>
          {/* フォーム内の他要素（Input・上のボタン）と同じ w-full に揃える
              （LPのw-72固定はヒーロー内で単独表示する時のみの調整）。 */}
          <div className="flex w-full flex-col gap-3">
            <OAuthSignInButton
              provider="google"
              next={`/join/${token}`}
              lastUsed={lastAuthProvider === "google"}
            />
            <OAuthSignInButton
              provider="apple"
              next={`/join/${token}`}
              lastUsed={lastAuthProvider === "apple"}
            />
          </div>
        </div>
      )}

      {error && <MessageBox kind="error">{error}</MessageBox>}
    </div>
  );
}
