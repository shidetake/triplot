"use client";

import { useState } from "react";
import { toast } from "@/components/toast";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function GoogleSignInButton({ next }: { next?: string }) {
  const [isLoading, setIsLoading] = useState(false);

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
      toast(`ログインに失敗しました: ${error.message}`);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleSignIn}
      disabled={isLoading}
      className="h-12 gap-2 px-6"
    >
      {isLoading ? "ログイン中..." : "Google でログイン"}
    </Button>
  );
}
