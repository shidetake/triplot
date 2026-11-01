import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { OAuthSignInButton } from "@/components/oauth-sign-in-button";
import { Button } from "@/components/ui/button";
import { resolveLastAuthProvider } from "@/lib/lastAuthProvider.server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { createClient } from "@/lib/supabase/server";

import { approveAction, denyAction } from "./actions";

// AI（MCP のクライアント）に triplot をつなぐ許可の画面。Supabase Auth の
// OAuth 2.1 サーバーが ?authorization_id=… を付けてここへ送ってくる
// （Supabase の「Authorization Path」に /oauth/consent を設定してある）。
//
// AI は自分で登録できる（動的クライアント登録）ので、名前は名乗った通りに
// しか出せない。偽物を見分けられるよう、戻り先のドメインも出す。
// 設計: docs/design/mcp.md

// 招待の画面と同じく、一点集中の画面なので Smart App Banner は出さない。
export const metadata: Metadata = {
  other: {
    "apple-itunes-app": "",
  },
};

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; failed?: string }>;
}) {
  const { authorization_id: authorizationId, failed } = await searchParams;
  const t = await getTranslations("oauthConsent");

  if (!authorizationId) {
    return <Message title={t("invalidTitle")} body={t("invalidBody")} />;
  }

  // ゲスト（匿名のセッション）は端末に閉じたものなので、AI につながせない。
  // ログインしてもらってから戻ってくる。
  const user = await getAuthUser();
  if (!user || user.isAnonymous) {
    const lastAuthProvider = await resolveLastAuthProvider();
    const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    return (
      <main className="mx-auto w-full max-w-md px-6 py-16">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("signInFirst")}</p>
        <div className="mt-8 flex flex-col gap-3">
          <OAuthSignInButton
            provider="google"
            next={next}
            lastUsed={lastAuthProvider === "google"}
          />
          <OAuthSignInButton
            provider="apple"
            next={next}
            lastUsed={lastAuthProvider === "apple"}
          />
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    console.error("[oauth/consent] details failed", error);
    return <Message title={t("invalidTitle")} body={t("invalidBody")} />;
  }
  // 前に許可したのと同じ範囲なら、聞き直さずに戻す。
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const host = hostOf(data.redirect_uri);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-4 text-sm">
        {t.rich("request", {
          client: data.client.name || t("unnamedClient"),
          b: (chunks) => <span className="font-semibold">{chunks}</span>,
        })}
      </p>
      <dl className="mt-6 space-y-3 rounded-lg border border-foreground/10 p-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t("returnsTo")}</dt>
          <dd className="mt-0.5 font-medium break-all">{host}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("signedInAs")}</dt>
          <dd className="mt-0.5 break-all">{data.user.email}</dd>
        </div>
      </dl>
      <p className="mt-6 text-sm">{t("grants")}</p>
      <p className="mt-2 text-sm text-muted-foreground">{t("checkHost")}</p>
      {failed && (
        <p className="mt-4 text-sm text-red-700 dark:text-red-300">
          {t("failed")}
        </p>
      )}
      <div className="mt-8 flex gap-2">
        <form action={denyAction.bind(null, authorizationId)} className="flex-1">
          <Button type="submit" variant="outline" className="w-full">
            {t("deny")}
          </Button>
        </form>
        <form
          action={approveAction.bind(null, authorizationId)}
          className="flex-1"
        >
          <Button type="submit" className="w-full">
            {t("approve")}
          </Button>
        </form>
      </div>
    </main>
  );
}

function hostOf(uri: string): string {
  try {
    return new URL(uri).host || uri;
  } catch {
    return uri;
  }
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto w-full max-w-md px-6 py-20">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </main>
  );
}
