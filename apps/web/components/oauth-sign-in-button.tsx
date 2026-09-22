"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "@/components/toast";

import { createClient } from "@/lib/supabase/client";
import { AppleGlyph, GoogleGlyph } from "@/components/oauth-brand-icons";

// OAuth サインインボタン（Google / Apple 共通）。redirectTo・next の配線は
// プロバイダ非依存なので1コンポーネントに統一し、provider ごとにロゴだけ差し替える。
// 配色は各社ブランド別（黒/白の反転）にせず、Strava/AllTrails 等と同じく**全プロバイダ共通の
// ニュートラルな枠線ボタン**に統一する（triplot 自身のトーンを優先。ロゴだけがブランドを示す）。
// このニュートラル配色（白地+`#747775`枠 / ダーク`#131314`地+`#8E918F`枠）は元は Google の
// ブランドガイドライン値だが、Apple 側にも流用してよい中立トーンとして採用（Apple のガイドラインは
// 自社ボタンの角丸を自分のUIに合わせることを許容しており、配色の統一も同じ考え方の延長）。
const LABEL_KEY = {
  google: "signInWithGoogle",
  apple: "signInWithApple",
} as const;

const NEUTRAL_STYLE =
  "bg-white text-[#1F1F1F] border border-[#747775] hover:bg-[#F7F8F8] " +
  "dark:bg-[#131314] dark:text-[#E3E3E3] dark:border-[#8E918F] dark:hover:bg-[#1E1F20]";

const PROVIDER_ICON = {
  google: GoogleGlyph,
  apple: AppleGlyph,
} as const;

export function OAuthSignInButton({
  provider,
  next,
  lastUsed = false,
  upgradeToken,
  disabled = false,
}: {
  provider: keyof typeof LABEL_KEY;
  next?: string;
  // ゲストからの昇格で使う引き換え券。渡すと callback で引き換えられる。
  upgradeToken?: string;
  // 券が取れるまで押させない等、呼び出し側の都合で止めたい時に使う。
  disabled?: boolean;
  // 前回この端末でサインインに使ったプロバイダか（Google の「前回このアカウントで
  // ログインしました」等でよく見る UX）。読み取りは cookie から Server Component
  // 側で行い props で渡す（apps/web/lib/lastAuthProvider.server.ts）。
  lastUsed?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations("auth");
  const Icon = PROVIDER_ICON[provider];

  const runSignIn = async () => {
    setIsLoading(true);
    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (next) callbackUrl.searchParams.set("next", next);
    // callback 側で成功時にこの値を cookie へ書き戻す（次回の lastUsed 判定用）。
    callbackUrl.searchParams.set("provider", provider);
    // ゲストからの昇格。サインインするとセッションが新しいアカウントに
    // 切り替わるので、引き換え券を callback まで持ち回って向こうで引き換える
    // （packages/shared/src/data/guestUpgrade.ts）。
    if (upgradeToken) callbackUrl.searchParams.set("upgrade", upgradeToken);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl.toString() },
    });
    if (error) {
      setIsLoading(false);
      toast(t("signInFailed", { message: error.message }));
    }
  };

  return (
    <button
      type="button"
      onClick={runSignIn}
      disabled={isLoading || disabled}
      className={
        "relative inline-flex h-12 w-full shrink-0 items-center justify-center gap-3 rounded-md " +
        "px-4 font-medium transition focus-visible:outline-none focus-visible:ring-2 " +
        "focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 " +
        NEUTRAL_STYLE
      }
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span>{isLoading ? t("signingIn") : t(LABEL_KEY[provider])}</span>
      {lastUsed && (
        <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium leading-none text-primary-foreground shadow-sm">
          {t("lastUsed")}
        </span>
      )}
    </button>
  );
}
