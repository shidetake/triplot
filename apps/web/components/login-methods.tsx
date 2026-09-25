"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  LOGIN_PROVIDERS,
  type LoginProvider,
  linkedProviders,
} from "@triplot/shared/loginMethods";

import { HelpTip } from "@/components/help-tip";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { AppleGlyph, GoogleGlyph } from "@/components/oauth-brand-icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// 設定の「ログイン方法」。今のアカウントに Google / Apple を足す。
//
// 足すだけで、アカウントの統合はしない。その Google / Apple で既に別の
// アカウントがあると Supabase が断るので、戻ってきた先で案内を出す
// （LinkResultToast。@triplot/shared/loginMethods 参照）。
//
// web は追加もログインと同じくリダイレクトで行う（Google / Apple の画面に
// 飛び、/auth/callback に戻る）。iOS は画面内の本人確認で完結する。
//
// ゲストには出さない（ゲストの本登録は引換券方式。guestUpgrade.ts）。
const PROVIDER_NAME: Record<LoginProvider, string> = {
  google: "Google",
  apple: "Apple",
};

const PROVIDER_ICON = {
  google: GoogleGlyph,
  apple: AppleGlyph,
} as const;

export function LoginMethods() {
  const t = useTranslations("settings");
  const [linked, setLinked] = useState<Set<LoginProvider> | null>(null);
  const [busy, setBusy] = useState<LoginProvider | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const {
        data: { user },
      } = await createClient().auth.getUser();
      if (!alive || !user || user.is_anonymous) return;
      setLinked(linkedProviders(user.identities));
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 読み込み中とゲストは出さない。
  if (!linked) return null;

  const add = async (provider: LoginProvider) => {
    setBusy(provider);
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    // 戻り先は今いるページ（設定はオーバーレイなので、元の画面に戻す）。
    callbackUrl.searchParams.set(
      "next",
      window.location.pathname + window.location.search,
    );
    callbackUrl.searchParams.set("link", provider);
    const { error } = await createClient().auth.linkIdentity({
      provider,
      options: { redirectTo: callbackUrl.toString() },
    });
    // 成功ならこのままリダイレクトしていく。ここに来るのは飛ぶ前の失敗だけ。
    if (error) {
      setBusy(null);
      toast(
        t("loginMethodLinkFailed", {
          provider: PROVIDER_NAME[provider],
          message: error.message,
        }),
      );
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{t("loginMethods")}</span>
        <HelpTip label={t("loginMethodsHelpLabel")}>
          {t("loginMethodsHelp")}
        </HelpTip>
      </div>
      <ul className="divide-y divide-foreground/10 rounded-md border border-foreground/10">
        {LOGIN_PROVIDERS.map((provider) => {
          const Icon = PROVIDER_ICON[provider];
          const name = PROVIDER_NAME[provider];
          const isLinked = linked.has(provider);
          return (
            <li key={provider} className="flex h-11 items-center gap-3 px-3">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 text-sm">{name}</span>
              {isLinked ? (
                <span
                  className="flex h-8 w-8 items-center justify-center text-muted-foreground"
                  title={t("loginMethodLinked", { provider: name })}
                  aria-label={t("loginMethodLinked", { provider: name })}
                  role="img"
                >
                  <CheckIcon size={18} />
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="rounded-full"
                  onClick={() => void add(provider)}
                  disabled={busy !== null}
                  aria-label={t("loginMethodAdd", { provider: name })}
                  title={t("loginMethodAdd", { provider: name })}
                >
                  <PlusIcon size={18} />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
