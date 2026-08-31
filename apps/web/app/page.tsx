import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { DevSignInButton } from "@/components/dev-sign-in-button";
import { OAuthSignInButton } from "@/components/oauth-sign-in-button";
import { resolveLastAuthProvider } from "@/lib/lastAuthProvider.server";
import { createClient } from "@/lib/supabase/server";

// ランディングページ（公開）。ログイン済みでも即リダイレクトせず
// 「アプリを開く →」CTA を出す（Notion 方式）。
//
// **機能の説明はログインの有無に関わらず出す。** Google の OAuth ブランディング
// 検証は、ホームページを見て「ログインしないとアプリの内容が分からない」もの
// （＝実質ログインページ）を却下する。実際に一度その理由で落ちている。
export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [t, lastAuthProvider] = await Promise.all([
    getTranslations("landing"),
    resolveLastAuthProvider(),
  ]);

  // 旅行詳細の4タブ（予定/場所/費用/TODO）＝主要機能。その下にメール取り込みと
  // 共有を置く。並び順が優先度で、見出しの大きさは変えない。
  const features = [
    { title: t("scheduleTitle"), body: t("scheduleBody") },
    { title: t("placesTitle"), body: t("placesBody") },
    { title: t("expensesTitle"), body: t("expensesBody") },
    { title: t("todosTitle"), body: t("todosBody") },
    { title: t("importTitle"), body: t("importBody") },
    { title: t("shareTitle"), body: t("shareBody") },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-24">
      <section className="space-y-6">
        <h1 className="text-4xl font-semibold tracking-tight">triplot</h1>
        <p className="text-lg text-muted-foreground">{t("tagline")}</p>
        <p className="text-sm text-muted-foreground">{t("lead")}</p>

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
              <OAuthSignInButton
                provider="google"
                next="/trips"
                lastUsed={lastAuthProvider === "google"}
              />
              <OAuthSignInButton
                provider="apple"
                next="/trips"
                lastUsed={lastAuthProvider === "apple"}
              />
            </div>
            <p className="text-sm text-muted-foreground">{t("joinHint")}</p>
            {/* 開発用ログイン（next dev のみ・本番ビルドには存在しない）。 */}
            <DevSignInButton />
          </div>
        )}
      </section>

      <section className="mt-24 space-y-8">
        {features.map((f) => (
          <div key={f.title} className="space-y-2">
            <h2 className="text-lg font-semibold">{f.title}</h2>
            <p className="text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      {/* Google OAuth 確認の要件: プライバシーポリシーと利用規約へのリンクを
          ホームページに可視で置くこと（App Store の要件も同じ URL で満たす）。 */}
      <footer className="mt-24 flex items-center gap-4 border-t border-foreground/10 pt-6">
        <Link
          href="/privacy"
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          {t("privacy")}
        </Link>
        <Link
          href="/terms"
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          {t("terms")}
        </Link>
      </footer>
    </main>
  );
}
