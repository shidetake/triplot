"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// 許可の画面のボタン。どちらも Supabase に結果を伝え、返ってきた戻り先
// （AI 側の URL。許可なら認可コード、拒否なら access_denied が付く）へ送る。
// ブラウザでの自動の遷移は使わない（サーバーで呼ぶので、戻り先を受け取って
// redirect する）。

export async function approveAction(authorizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.approveAuthorization(
    authorizationId,
    { skipBrowserRedirect: true },
  );
  if (error || !data) {
    console.error("[oauth/consent] approve failed", error);
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&failed=1`);
  }
  redirect(data.redirect_url);
}

export async function denyAction(authorizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.denyAuthorization(
    authorizationId,
    { skipBrowserRedirect: true },
  );
  if (error || !data) {
    console.error("[oauth/consent] deny failed", error);
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&failed=1`);
  }
  redirect(data.redirect_url);
}
