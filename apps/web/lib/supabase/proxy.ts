// Next.js 16 の Proxy（旧 middleware）から呼び出して Supabase セッションをリフレッシュする。
// @supabase/ssr の標準パターンに準拠。

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@triplot/shared/types/database";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // セッションのリフレッシュ。`getUser` を呼ぶことで cookie が更新される。
  const { error } = await supabase.auth.getUser();

  // getUser の自動更新は「期限が近いか」の時間ベースだけで、サーバの時計補正等で
  // トークンが期限内なのにサーバから拒否されるケース（401, 例:
  // "JWT issued at future"）は救えない。失敗時は明示的に取り直す
  // （apps/mobile/src/lib/supabase.ts の authAwareFetch と同じ考え方）。
  // 未ログイン（セッション自体が無い）はリフレッシュしても無駄なので除く。
  if (error && error.name !== "AuthSessionMissingError") {
    await supabase.auth.refreshSession();
  }

  return response;
}
