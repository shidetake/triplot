import { NextResponse, type NextRequest } from "next/server";

// TEMP(diagnostic): Supabase セッション更新を外した no-op middleware。
// 本番 500 の source が edge-middleware だったため、middleware を空にして
// ページ/route が復活するか（＝middleware が crash 点か）を切り分ける。確認後に戻す。
export function proxy(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
