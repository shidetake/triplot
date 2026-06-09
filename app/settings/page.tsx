import Link from "next/link";
import { redirect } from "next/navigation";

import { SaveIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";

import { updateDisplayNameAction } from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // 既定の表示名（旅行作成/参加時のデフォルト）。
  const { data: profile } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .single();

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

      <div className="mt-10 space-y-6">
        <section className="space-y-3 rounded-lg border border-zinc-200 p-5">
          <div>
            <h2 className="font-medium">表示名（デフォルト）</h2>
            <p className="mt-1 text-sm text-zinc-600">
              旅行を作る・参加するときに既定で入る名前です。旅行ごとに別の名前を付ける
              こともできます（既存の旅行の名前はここでは変わりません）。
            </p>
          </div>
          <form
            action={updateDisplayNameAction}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              name="display_name"
              defaultValue={profile?.display_name ?? ""}
              placeholder="名前"
              maxLength={50}
              className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
            <button
              type="submit"
              aria-label="保存"
              title="保存"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-black text-white transition hover:bg-zinc-800"
            >
              <SaveIcon size={18} />
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
