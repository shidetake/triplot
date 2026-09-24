import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// 管理ページ共通の入口チェック。未ログインは LP へ、非 admin にはページの
// 存在自体を見せない（メニューにも出ないので 404 で隠す）。通ったら、以降の
// 読み込みに使うログイン中のクライアントを返す（データは RLS / 管理者用 RPC の
// is_app_admin() が守る。ここは画面の出し分け）。
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) notFound();

  return supabase;
}
