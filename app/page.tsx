import Link from "next/link";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { createClient } from "@/lib/supabase/server";

// ランディングページ（公開）。骨組みのみ — コピー/スクショ等の本体は別タスクで後追い。
// ログイン済みでも即リダイレクトせず「アプリを開く →」CTA を出す（Notion 方式）。
export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-24">
      <section className="space-y-6">
        <h1 className="text-4xl font-semibold tracking-tight">triplot</h1>
        <p className="text-lg text-zinc-600">
          友達と旅行プランを立てて、思い出として残すアプリ。
        </p>

        {user ? (
          <Link
            href="/trips"
            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            アプリを開く →
          </Link>
        ) : (
          <div className="space-y-4">
            <GoogleSignInButton next="/trips" />
            <p className="text-sm text-zinc-500">
              ログイン不要で参加だけしたい場合は、共有リンクから直接アクセスしてください。
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
