import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { PrivacyEn } from "./privacy-en";
import { PrivacyJa } from "./privacy-ja";

// プライバシーポリシー（公開ページ・認証不要）。Google OAuth の確認要件と
// App Store の要件を満たす単一の真実。実装の実態（Supabase 東京・受信メール
// 90日削除・カレンダーは app.created スコープのみ等）と齟齬が出たら必ず
// こちらも更新すること。
//
// 日本語版が正本で、英語版は参考訳（本文の「言語」の節）。表示の言語で出し分ける。
export async function generateMetadata(): Promise<Metadata> {
  const en = (await getLocale()) === "en";
  return { title: en ? "Privacy Policy | triplot" : "プライバシーポリシー | triplot" };
}

export default async function PrivacyPage() {
  return (await getLocale()) === "en" ? <PrivacyEn /> : <PrivacyJa />;
}
