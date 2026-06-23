import { getRequestConfig } from "next-intl/server";

import en from "@triplot/shared/messages/en.json";
import ja from "@triplot/shared/messages/ja.json";

import { resolveLocale } from "./locale";

// カタログは packages/shared/messages（RN と共有する翻訳の中身）。
// 動的 import ではなく静的 import でバンドルに取り込む。理由: カタログが Vercel の
// プロジェクトルート（apps/web）の外にあり、動的 import のファイルトレースが届かず
// サーバーレス関数に同梱されない（＝本番 500）。ロケールは2つだけで JSON も小さいので
// 両方インライン化して取りこぼしを無くす。
const MESSAGES = { ja, en };

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, messages: MESSAGES[locale] };
});
