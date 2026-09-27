// ログイン（とログイン方法の追加）が失敗して戻ってきた時の理由を、利用者に
// どう見せるかで3つに分ける。Supabase は失敗すると、戻り先の URL に
// error / error_code / error_description を付けて返す。
//
// - unavailable: こちら側の不具合（Supabase と Google / Apple の照合の失敗、
//   ログイン方法が無効 など）。何度やっても入れないので「やり直して」とは言わず、
//   別の方法を案内する。管理者にも知らせる（利用者より先に気付けるように。
//   実例: web の Apple ログインが鍵の期限切れで全員分失敗し続けていたのに、
//   誰も気付けなかった）。
// - canceled: 利用者が Google / Apple の画面でやめた。失敗ではないので何も出さない。
// - retry: それ以外（途中でブラウザが切り替わった、通信の失敗など）。やり直せば
//   入れることが多い。

export type SignInFailure = "unavailable" | "canceled" | "retry";

export function classifySignInError(e: {
  error?: string | null;
  code?: string | null;
  description?: string | null;
}): SignInFailure {
  const text = `${e.error ?? ""} ${e.code ?? ""} ${e.description ?? ""}`;
  if (e.error === "access_denied" || /cancel/i.test(text)) return "canceled";
  if (
    e.error === "server_error" ||
    e.code === "unexpected_failure" ||
    /unable to exchange external code|provider is not enabled|unsupported provider/i.test(
      text,
    )
  ) {
    return "unavailable";
  }
  return "retry";
}
