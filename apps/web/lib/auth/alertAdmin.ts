import { Resend } from "resend";

import { createServiceClient } from "@/lib/supabase/service";

// ログインが「こちら側の不具合」で失敗した時に、管理者へメールで知らせる
// （@triplot/shared/signInError の unavailable）。
//
// 利用者より先に気付くため。実例: web の Apple ログインが鍵の期限切れで全員分
// 失敗し続けていたのに、画面には何も出ず、誰も気付けなかった。
//
// **同じログイン方法について1時間に1通まで。** 壊れている間は来た人全員が
// 失敗するので、そのまま送ると失敗の数だけメールが届く。間引きは取り込みの
// 排他と同じリース（try_acquire_lease）に乗せる: 取れた1回だけ送り、リースは
// 解かずに期限まで残す。人が始めた処理だがログインに失敗していて名札が無いので、
// リースの読み書きは service role で行う（docs/database.md の種類3＝システム内部の
// 作業用メモ）。
//
// 宛先はフィードバックの管理者通知と同じ（FEEDBACK_NOTIFY_EMAIL＝管理者の
// アドレス）。RESEND_API_KEY / 宛先が無い環境（ローカル・プレビュー）では送らない。
// best-effort: 失敗してもログインの流れには影響させない（ログのみ）。

const FROM = "triplot <noreply@triplot.app>";
const THROTTLE_SECONDS = 60 * 60;

export async function alertAdminAuthFailure(params: {
  provider: string;
  // ログインか、設定の「ログイン方法」からの追加か。
  flow: "sign-in" | "link";
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_NOTIFY_EMAIL;
  if (!apiKey || !to) return;

  try {
    const { data: acquired, error } = await createServiceClient().rpc(
      "try_acquire_lease",
      { p_name: `auth_alert:${params.provider}`, p_ttl_seconds: THROTTLE_SECONDS },
    );
    if (error) {
      console.error("[auth-alert] throttle failed", error.message);
      return;
    }
    // 1時間以内に既に送っている。
    if (acquired !== true) return;

    const name =
      params.provider === "google"
        ? "Google"
        : params.provider === "apple"
          ? "Apple"
          : params.provider;
    const flowLabel = params.flow === "link" ? "ログイン方法の追加" : "ログイン";
    // 管理者向けなので日本語固定（フィードバックの管理者通知と同じ扱い）。
    const text = [
      `web の「${name}」の${flowLabel}が、こちら側の不具合で失敗しています。`,
      "",
      `error: ${params.error ?? "-"}`,
      `error_code: ${params.errorCode ?? "-"}`,
      `error_description: ${params.errorDescription ?? "-"}`,
      "",
      "Apple の場合に疑うもの（どちらも Supabase のログに oauth2 \"invalid_client\" と出る）:",
      "- Apple Developer の Keys で、鍵から Sign in with Apple が外れていないか",
      "- client secret（最長6か月）の期限切れ",
      "直し方は docs/architecture.md の「人手の定期メンテナンス」。",
      "",
      `このメールは同じログイン方法について ${THROTTLE_SECONDS / 60} 分に1通まで送ります。`,
    ].join("\n");

    const { error: sendError } = await new Resend(apiKey).emails.send({
      from: FROM,
      to,
      subject: `【triplot】${name}の${flowLabel}が失敗しています`,
      text,
    });
    if (sendError) console.error("[auth-alert] mail send failed", sendError.message);
  } catch (e) {
    console.error("[auth-alert] failed", e);
  }
}
