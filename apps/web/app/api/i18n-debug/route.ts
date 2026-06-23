// TEMP(diagnostic): どの import が Lambda で失敗しているかを切り分ける。
// import を全てハンドラ内の動的 import（try/catch）に移し、module-load エラーを
// 実行時に捕まえて JSON で返す。確認後に削除する。
export const dynamic = "force-dynamic";

export async function GET() {
  const result: Record<string, unknown> = {};

  // (1) 別パッケージ（packages/shared）の JSON をこの関数バンドルで解決できるか
  try {
    const m = await import("@triplot/shared/messages/ja.json");
    const data = (m as { default?: Record<string, unknown> }).default ?? m;
    result.sharedJson = { ok: true, keys: Object.keys(data) };
  } catch (e) {
    result.sharedJson = { ok: false, error: String(e) };
  }

  // (2) next-intl のサーバー関数が動くか
  try {
    const { getLocale, getMessages } = await import("next-intl/server");
    const locale = await getLocale();
    const messages = await getMessages();
    result.nextIntl = { ok: true, locale, keys: Object.keys(messages ?? {}) };
  } catch (e) {
    const err = e as Error;
    result.nextIntl = {
      ok: false,
      name: err?.name,
      message: err?.message,
      stack: err?.stack?.split("\n").slice(0, 6),
    };
  }

  return Response.json(result);
}
