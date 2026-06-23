"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "@/components/toast";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function GoogleSignInButton({ next }: { next?: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations("auth");

  const handleSignIn = async () => {
    setIsLoading(true);
    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (next) callbackUrl.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
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
      {isLoading ? t("signingIn") : t("signInWithGoogle")}
    </Button>
  );
}
