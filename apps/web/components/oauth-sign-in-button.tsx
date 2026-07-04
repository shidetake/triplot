"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "@/components/toast";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

// OAuth サインインボタン（Google / Apple 共通）。redirectTo・next の配線は
// プロバイダ非依存なので1コンポーネントに統一し、provider とラベルだけ差し替える。
// 見た目はテキストのみの Button（両プロバイダで統一。ロゴ入りの HIG 準拠は
// iOS アプリ化の時に再検討）。
const LABEL_KEY = {
  google: "signInWithGoogle",
  apple: "signInWithApple",
} as const;

export function OAuthSignInButton({
  provider,
  next,
}: {
  provider: keyof typeof LABEL_KEY;
  next?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations("auth");

  const handleSignIn = async () => {
    setIsLoading(true);
    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (next) callbackUrl.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl.toString() },
    });
    if (error) {
      setIsLoading(false);
      toast(t("signInFailed", { message: error.message }));
    }
  };

  return (
    <Button
      type="button"
      onClick={handleSignIn}
      disabled={isLoading}
      className="h-12 gap-2 px-6"
    >
      {isLoading ? t("signingIn") : t(LABEL_KEY[provider])}
    </Button>
  );
}
