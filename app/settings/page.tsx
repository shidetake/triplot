import Link from "next/link";
import { redirect } from "next/navigation";

import { LlmKeySettings } from "@/components/llm-key-settings";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">設定</h1>
        <Link
          href="/"
          className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
        >
          ← ホーム
        </Link>
      </header>

      <div className="mt-10">
        <LlmKeySettings />
      </div>
    </main>
  );
}
