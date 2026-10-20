import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { TermsEn } from "./terms-en";
import { TermsJa } from "./terms-ja";

// 利用規約（公開ページ・認証不要）。Google OAuth の同意画面に載せるリンク先
// （ブランディングの「アプリケーション利用規約リンク」に登録する）と、
// App Store の要件を満たす単一の真実。
//
// 実装の実態（利用枠の月間上限・共有リンクは URL を知っていれば誰でも参加できる
// 等）と齟齬が出たら必ずこちらも更新すること。
//
// 日本語版が正本で、英語版は参考訳（本文の「言語」の節）。表示の言語で出し分ける。
export async function generateMetadata(): Promise<Metadata> {
  const en = (await getLocale()) === "en";
  return { title: en ? "Terms of Service | triplot" : "利用規約 | triplot" };
}

export default async function TermsPage() {
  return (await getLocale()) === "en" ? <TermsEn /> : <TermsJa />;
}
