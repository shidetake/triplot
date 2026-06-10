"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

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
      alert(`ログインに失敗しました: ${error.message}`);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignIn}
      disabled={isLoading}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
    >
      {isLoading ? "ログイン中..." : "Google でログイン"}
    </button>
  );
}
