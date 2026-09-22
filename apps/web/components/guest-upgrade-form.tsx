"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { createGuestUpgradeTicket } from "@triplot/shared/data/guestUpgrade";
import { MessageBox } from "@/components/message-box";
import { createClient } from "@/lib/supabase/client";

import { OAuthSignInButton } from "./oauth-sign-in-button";

// ゲスト（匿名サインイン）から本アカウントへの昇格。
//
// サインインするとセッションが新しいアカウントに切り替わるので、**ゲストのうちに**
// 引き換え券を取っておき、それを callback まで持ち回って向こうで引き換える
// （app/auth/callback/route.ts）。券が取れるまではボタンを押させない。
export function GuestUpgradeForm({ next }: { next: string }) {
  const t = useTranslations();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const result = await createGuestUpgradeTicket(createClient());
      if (!alive) return;
      if (result.ok) setToken(result.data.token);
      else setError(t("errors.upgradeFailed"));
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">
        {t("account.upgradeBody")}
      </p>

      {error ? (
        <MessageBox kind="error">{error}</MessageBox>
      ) : (
        <div className="flex w-full flex-col gap-3">
          <OAuthSignInButton
            provider="google"
            next={next}
            upgradeToken={token ?? undefined}
            disabled={!token}
          />
          <OAuthSignInButton
            provider="apple"
            next={next}
            upgradeToken={token ?? undefined}
            disabled={!token}
          />
        </div>
      )}
    </div>
  );
}
