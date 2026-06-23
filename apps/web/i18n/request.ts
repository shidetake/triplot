import { getRequestConfig } from "next-intl/server";

import { resolveLocale } from "./locale";

// next-intl のリクエスト設定。URL ルーティングを使わないので locale は自前解決し、
// カタログは packages/shared/messages から読む（RN と共有する翻訳の中身）。
// 動的 import のテンプレートはバンドラ解決を確実にするため明示分岐にする。
export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages =
    locale === "en"
      ? (await import("@triplot/shared/messages/en.json")).default
      : (await import("@triplot/shared/messages/ja.json")).default;
  return { locale, messages };
});
