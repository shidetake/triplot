// web の「Apple でログイン」の client secret（JWT）を自動で作り直して、
// Supabase の認証設定に入れ直す。
//
// なぜ要るか: Apple の仕様で、この JWT の有効期限は最長6か月。切れると web の
// Apple ログインが全員分失敗する（iOS は端末の Apple ログインを使うので影響を
// 受けない）。人が覚えておく運用だと、忘れた日に止まる。
//
// 呼ぶのは DB の定期実行（pg_cron → invoke_apple_client_secret_rotation）で、
// 週1回。**作り直すのは前回から ROTATE_AFTER_DAYS 経った時だけ**なので、失敗
// しても翌週以降にやり直す機会が何度もある（期限まで約4週の余裕）。
//
// 誰でも呼べる（JWT の検証なし）。呼ばれても「期限が近くなければ何もしない」
// ので、叩かれて困ることは無い。鍵は受け取らず、ここの秘密（Function Secrets）
// からしか読まない。
//
// 必要な秘密（本番だけに入れる。staging は Apple ログインを使っていない）:
//   APPLE_P8                 Apple Developer の鍵（.p8 の中身）
//   APPLE_KEY_ID / APPLE_TEAM_ID
//   MANAGEMENT_API_TOKEN      範囲を絞った管理用トークン（このプロジェクトの
//                             Auth Config と Project Settings の読み書きだけ）。
//                             名前を SUPABASE_ で始めない（Supabase が予約していて
//                             保存を黙って拒む）
//   MANAGEMENT_API_TOKEN_EXPIRES_AT  そのトークンの期限（YYYY-MM-DD）。トークンは
//                             最長1年なので、期限の30日前から毎週知らせる
//   RESEND_API_KEY / ALERT_EMAIL  失敗の知らせの送り先
//
// 失敗したら管理者にメールする。ログイン失敗の知らせ（apps/web/lib/auth/alertAdmin.ts）
// より先に気付けるように。

import { createClient } from "jsr:@supabase/supabase-js@2";

// web の Services ID（Supabase の Apple の Client IDs の先頭）。
const SERVICES_ID = "app.triplot.web";
// Apple の上限は 15777000 秒（約182日）。上限ちょうどにする。
const LIFETIME_SECONDS = 15777000;
// 前回から何日経ったら作り直すか。期限（約182日）までに週1回の実行で
// 4回ほどやり直せる幅を残す。
const ROTATE_AFTER_DAYS = 150;
// 管理用トークンの期限の何日前から知らせるか。
const TOKEN_WARN_DAYS = 30;

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    await warnIfTokenExpiring(sb);

    const { data: last, error: readError } = await sb
      .from("apple_client_secret_rotations")
      .select("rotated_at")
      .order("rotated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw new Error(`記録の読み出しに失敗: ${readError.message}`);

    if (last) {
      const ageDays = (Date.now() - new Date(last.rotated_at).getTime()) / 86400000;
      if (ageDays < ROTATE_AFTER_DAYS) {
        return json({ rotated: false, lastRotatedAt: last.rotated_at });
      }
    }

    // 1時間に1回まで。重なって呼ばれても二重に作り直さず、誰かに叩かれ続けても
    // 失敗の知らせが1時間に1通で止まる。
    const { data: acquired, error: leaseError } = await sb.rpc("try_acquire_lease", {
      p_name: "apple_client_secret_rotation",
      p_ttl_seconds: 3600,
    });
    if (leaseError) throw new Error(`排他の取得に失敗: ${leaseError.message}`);
    if (acquired !== true) return json({ rotated: false, reason: "running" });

    const p8 = required("APPLE_P8");
    const keyId = required("APPLE_KEY_ID");
    const teamId = required("APPLE_TEAM_ID");
    const token = required("MANAGEMENT_API_TOKEN");

    const now = Math.floor(Date.now() / 1000);
    const exp = now + LIFETIME_SECONDS;
    const secret = await signClientSecret({ p8, keyId, teamId, iat: now, exp });

    const ref = new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname.split(".")[0];
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ external_apple_secret: secret }),
    });
    if (!res.ok) {
      throw new Error(`認証設定の更新に失敗: HTTP ${res.status} ${await res.text()}`);
    }

    const expiresAt = new Date(exp * 1000).toISOString();
    const { error: writeError } = await sb
      .from("apple_client_secret_rotations")
      .insert({ rotated_at: new Date(now * 1000).toISOString(), expires_at: expiresAt });
    // 入れ替え自体は済んでいる。記録が残らないと来週また作り直すだけなので、
    // 知らせはするが失敗扱いにはしない。
    if (writeError) {
      await alert(`入れ替えは成功したが、記録の書き込みに失敗: ${writeError.message}`);
    }

    return json({ rotated: true, expiresAt });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[rotate-apple-client-secret]", message);
    await alert(message);
    return json({ rotated: false, error: message }, 500);
  }
});

// 管理用トークンの期限が近ければ知らせる。週1回の実行ごとに1通（誰かに叩かれ
// 続けても増えないよう、6日のリースで間引く）。
async function warnIfTokenExpiring(sb: ReturnType<typeof createClient>): Promise<void> {
  const raw = Deno.env.get("MANAGEMENT_API_TOKEN_EXPIRES_AT");
  if (!raw) return;
  const daysLeft = (new Date(`${raw}T00:00:00Z`).getTime() - Date.now()) / 86400000;
  if (!(daysLeft < TOKEN_WARN_DAYS)) return;
  const { data: acquired } = await sb.rpc("try_acquire_lease", {
    p_name: "management_api_token_expiry_warning",
    p_ttl_seconds: 6 * 86400,
  });
  if (acquired !== true) return;
  await sendMail(
    "【triplot】Apple ログインの自動更新に使うトークンの期限が近づいています",
    [
      `web の「Apple でログイン」の client secret を自動で作り直すための Supabase の管理用トークンが、${raw} に期限切れになります${daysLeft < 0 ? "（既に切れています）" : `（あと${Math.ceil(daysLeft)}日）`}。`,
      "",
      "作り直して、Supabase の Function Secrets の MANAGEMENT_API_TOKEN と MANAGEMENT_API_TOKEN_EXPIRES_AT を入れ替えてください。",
      "作り方は docs/architecture.md の「人手の定期メンテナンス」。",
    ].join("\n"),
  );
}

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`秘密 ${name} が設定されていない`);
  return v;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function signClientSecret(p: {
  p8: string;
  keyId: string;
  teamId: string;
  iat: number;
  exp: number;
}): Promise<string> {
  const der = Uint8Array.from(
    atob(p.p8.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = { alg: "ES256", kid: p.keyId };
  const payload = {
    iss: p.teamId,
    iat: p.iat,
    exp: p.exp,
    aud: "https://appleid.apple.com",
    sub: SERVICES_ID,
  };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  // WebCrypto の ECDSA の署名は r||s の生の形で、JWT（ES256）が求める形そのもの。
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

function b64url(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function alert(detail: string): Promise<void> {
  return sendMail(
    "【triplot】Apple ログインの client secret の自動更新が失敗しました",
    [
      "web の「Apple でログイン」の client secret（最長6か月）の自動更新が失敗しました。",
      "毎週やり直すので、原因を直せば次の実行で入れ替わります。",
      "",
      detail,
      "",
      "直し方は docs/architecture.md の「人手の定期メンテナンス」。",
    ].join("\n"),
  );
}

// 管理者向けなので日本語固定（ログイン失敗の知らせと同じ扱い）。
async function sendMail(subject: string, text: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("ALERT_EMAIL");
  if (!apiKey || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "triplot <noreply@triplot.app>",
        to,
        subject,
        text,
      }),
    });
    if (!res.ok) console.error("[rotate-apple-client-secret] mail failed", res.status);
  } catch (e) {
    console.error("[rotate-apple-client-secret] mail failed", e);
  }
}
