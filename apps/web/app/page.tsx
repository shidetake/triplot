import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { OAuthSignInButton } from "@/components/oauth-sign-in-button";
import { createClient } from "@/lib/supabase/server";

// ランディングページ（公開）。骨組みのみ — コピー/スクショ等の本体は別タスクで後追い。
// ログイン済みでも即リダイレクトせず「アプリを開く →」CTA を出す（Notion 方式）。
export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const t = await getTranslations("landing");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-24">
      <section className="space-y-6">
        <h1 className="text-4xl font-semibold tracking-tight">triplot</h1>
        <p className="text-lg text-muted-foreground">{t("tagline")}</p>

        {user ? (
          <Link
            href="/trips"
            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            {t("openApp")}
          </Link>
        ) : (
          <div className="space-y-4">
            {/* 縦積み: 狭い画面前提のヒーローで2ボタンを同格に見せる。w-72固定でブランド
                ボタン2つの横幅を揃える。 */}
            <div className="flex w-72 flex-col gap-3">
              <OAuthSignInButton provider="google" next="/trips" />
              <OAuthSignInButton provider="apple" next="/trips" />
            </div>
            <p className="text-sm text-muted-foreground">{t("joinHint")}</p>
          </div>
        )}
      </section>
    </main>
  );
}
