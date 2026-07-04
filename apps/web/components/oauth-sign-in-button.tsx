"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "@/components/toast";

import { createClient } from "@/lib/supabase/client";
import { AppleGlyph, GoogleGlyph } from "@/components/oauth-brand-icons";

// OAuth サインインボタン（Google / Apple 共通）。redirectTo・next の配線は
// プロバイダ非依存なので1コンポーネントに統一し、provider ごとに見た目だけ差し替える。
// 見た目は各社の公式ブランドガイドライン（配色・ロゴ）に合わせる。Apple の Usage
// Guidelines は web にも「公式ボタンのデザインガイドラインに従うこと」を明記しているため、
// triplot の <Button> ではなく native <button> にブランド色を直書きする（triplot の
// セマンティック色トークン運用の例外＝ui-guidelines「地図・Google連携」節と同じ考え方）。
// 角丸は Apple のガイドラインが「自分のUIの他のボタンに合わせてよい」としているため
// components/ui/button.tsx と同じ rounded-md を使う。フォントは Google 指定の
// Google Sans を新規導入せず、triplot 標準フォント + font-medium で近似する。
const LABEL_KEY = {
  google: "signInWithGoogle",
  apple: "signInWithApple",
} as const;

const PROVIDER_STYLE = {
  google:
    "bg-white text-[#1F1F1F] border border-[#747775] hover:bg-[#F7F8F8] " +
    "dark:bg-[#131314] dark:text-[#E3E3E3] dark:border-[#8E918F] dark:hover:bg-[#1E1F20]",
  // eslint-disable-next-line no-restricted-syntax -- Apple公式ブランドの黒/白ボタン（ui-guidelines「OAuthログインボタン」節）
  apple: "bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90",
} as const;

const PROVIDER_ICON = {
  google: GoogleGlyph,
  apple: AppleGlyph,
} as const;

export function OAuthSignInButton({
  provider,
  next,
}: {
  provider: keyof typeof LABEL_KEY;
  next?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations("auth");
  const Icon = PROVIDER_ICON[provider];

  const handleSignIn = async () => {
    setIsLoading(true);
    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (next) callbackUrl.searchParams.set("next", next);
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
      onClick={handleSignIn}
      disabled={isLoading}
      className={
        "inline-flex h-12 w-full shrink-0 items-center justify-center gap-3 rounded-md " +
        "px-4 font-medium transition focus-visible:outline-none focus-visible:ring-2 " +
        "focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 " +
        PROVIDER_STYLE[provider]
      }
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span>{isLoading ? t("signingIn") : t(LABEL_KEY[provider])}</span>
    </button>
  );
}
