import { NextResponse } from "next/server";
import { getLocale, getMessages } from "next-intl/server";

// TEMP(diagnostic): 本番 500 の真因を掴むため、next-intl のサーバー関数を try/catch して
// 実エラーを JSON ボディで返す（Vercel ログのトランケーションを回避）。確認後に削除する。
export async function GET() {
  try {
    const locale = await getLocale();
    const messages = await getMessages();
    return NextResponse.json({
      ok: true,
      locale,
      keys: Object.keys(messages ?? {}),
    });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({
      ok: false,
      name: err?.name,
      message: err?.message,
      stack: err?.stack?.split("\n").slice(0, 8),
    });
  }
}
