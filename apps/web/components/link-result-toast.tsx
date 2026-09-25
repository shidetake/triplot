"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { toast } from "@/components/toast";

// 設定の「ログイン方法」で Google / Apple を追加して戻ってきた時の結果を知らせる。
//
// web の追加は Google / Apple の画面へのリダイレクトを挟むので、結果は
// /auth/callback が戻り先の URL に付けて渡す（linked / link_error /
// link_provider）。知らせたら URL から消す（再読み込みで二度出さない）。
//
// 失敗の理由は2つ（@triplot/shared/loginMethods の classifyLinkError）:
// - already_used: その Google / Apple で既に別のアカウントがある → 案内
// - other: それ以外
const PROVIDER_NAME: Record<string, string> = { google: "Google", apple: "Apple" };

export function LinkResultToast() {
  const t = useTranslations("settings");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const providerKey = params.get("link_provider");
    if (!providerKey) return;
    const provider = PROVIDER_NAME[providerKey] ?? providerKey;
    const error = params.get("link_error");

    if (params.get("linked")) {
      toast(t("loginMethodLinkedToast", { provider }));
    } else if (error === "already_used") {
      toast(t("loginMethodAlreadyUsed", { provider }));
    } else if (error) {
      toast(t("loginMethodLinkFailedRetry", { provider }));
    }

    const rest = new URLSearchParams(params.toString());
    for (const k of ["link_provider", "linked", "link_error"]) rest.delete(k);
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router, t]);

  return null;
}
