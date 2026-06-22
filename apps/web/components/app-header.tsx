import Link from "next/link";

import { AccountMenu } from "@/components/account-menu";
import { InboxIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";

// アプリ内全ページ共通のヘッダー（薄い常時表示バー・auto-hide しない）。
// 左＝ワードマーク（アプリ内なので → /trips）、右＝受信箱＋アバター。
// LP（/）はワードマークの行き先が違う（→ /）ので使わない。
// 必要なデータ（プロフィール・受信箱バッジ）は自分で fetch する async サーバーコンポーネント。
export async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 未ログイン時の遷移は各ページの redirect に任せ、ここでは何も出さない。
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  // 実効アバター: users.avatar_url（登録時に OAuth 写真をコピー／カスタムで上書き）。無ければ頭文字。
  // 全メンバー共通の単一ソースなので、ここでも auth メタデータには fallback しない（自分だけ見え方が
  // 違うのを避ける）。
  const avatarUrl = profile?.avatar_url ?? null;
  const accountName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    profile?.display_name?.trim() ??
    null;

  // 受信箱バッジ: まだ旅行に割り当てていない下書きの件数（要割当）。
  const { count } = await supabase
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "extracted")
    .is("trip_id", null);
  const inboxCount = count ?? 0;

  return (
    // z-30: ページ内容より上、ポップオーバー/モーダル（z-40/50）より下。
    <header className="sticky top-0 z-30 border-b border-foreground/10 bg-white">
      <div className="flex h-12 items-center justify-between px-6">
        <Link href="/trips" className="text-lg font-semibold tracking-tight">
          triplot
        </Link>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/import"
            aria-label={
              inboxCount > 0 ? `取り込み（未割当 ${inboxCount} 件）` : "取り込み"
            }
            title={
              inboxCount > 0 ? `取り込み（未割当 ${inboxCount} 件）` : "取り込み"
            }
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
          >
            <InboxIcon size={24} />
            {inboxCount > 0 && (
              <span className="absolute right-0 top-0 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground ring-1 ring-white">
                {inboxCount > 9 ? "9+" : inboxCount}
              </span>
            )}
          </Link>
          <AccountMenu
            email={user.email ?? null}
            name={accountName}
            avatarUrl={avatarUrl}
          />
        </div>
      </div>
    </header>
  );
}
