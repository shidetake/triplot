"use client";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
    >
      ログアウト
    </button>
  );
}
