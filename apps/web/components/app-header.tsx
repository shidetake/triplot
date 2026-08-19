import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

import { fetchUnassignedInboundCount } from "@triplot/shared/data/reads/inbox";

import { AccountMenu } from "@/components/account-menu";
import { ChevronIcon } from "@/components/icons";
import { ImportSheetButton } from "@/components/import-sheet";
import { InlineDivider } from "@/components/inline-divider";
import { resolveTheme } from "@/i18n/theme.server";
import { createClient } from "@/lib/supabase/server";
import { getDeployEnv, getVersion } from "@/lib/version";

// アプリ内全ページ共通のヘッダー（薄い常時表示バー・auto-hide しない）。
// 右＝取り込み＋アバター。左は文脈で変わる:
//   - 通常のページ … ワードマーク（→ /trips）
//   - 旅行詳細     … 戻る＋旅行名/日程の2行タイトル（trip を渡した時）
//
// 旅行詳細はかつてこのバーの下にもう1本 h-11 の旅行ヘッダーを積んでいて、
// 狭い画面で 92px を固定チrome に取られていた。iOS がナビバー1本で済ませて
// いるのに合わせ、旅行の文脈をこのバーに畳んで**1本**にした。旅行の操作
// （編集・メンバー・共有・エクスポート・削除）は隣り合ったアカウントメニューに
// 吸収してある（tripMenu）。
//
// LP（/）はワードマークの行き先が違う（→ /）ので使わない。
// 必要なデータ（プロフィール・取り込みバッジ）は自分で fetch する async サーバーコンポーネント。
export async function AppHeader({
  trip,
  tripMenu,
  tripRows,
  tripActions,
}: {
  // 旅行詳細でだけ渡す。渡すとワードマークの代わりに戻る＋2行タイトルになる。
  trip?: { title: string; subtitle: ReactNode };
  // アカウントメニューに差し込む旅行の操作。広い画面はサブメニュー、
  // 狭い画面のシートは節見出し付きの一覧。
  tripMenu?: ReactNode;
  tripRows?: ReactNode;
  // バーに直接置く旅行のアクション（共有アイコン）。
  tripActions?: ReactNode;
} = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 未ログイン時の遷移は各ページの redirect に任せ、ここでは何も出さない。
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, avatar_url, is_admin")
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

  // 取り込みバッジ: まだ旅行に割り当てていない下書きの件数（要割当）。RN と共有。
  const importCount = await fetchUnassignedInboundCount(supabase, user.id);

  // admin だけ: 未対応フィードバックの件数（アカウントメニューの「管理」行バッジ）。
  // RLS の feedback_admin_select で admin 以外は読めない（クエリ自体もしない）。
  let openFeedbackCount = 0;
  if (profile?.is_admin) {
    const { count: feedbackCount } = await supabase
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    openFeedbackCount = feedbackCount ?? 0;
  }

  const backLabel = await getTranslations("tripDetail").then((tt) =>
    tt("backToTrips"),
  );
  // 設定シートのテーマ選択の初期値（cookie から解決）。
  const currentTheme = await resolveTheme();

  return (
    // z-30: ページ内容より上、ポップオーバー/モーダル（z-40/50）より下。
    // data-mobile-chrome-top: 狭い画面のボトムシートが「開いた時にこの帯の
    // 下端まで見せる」ため実測する対象（use-mobile-chrome-margins.ts 参照）。
    <header
      data-mobile-chrome-top
      className="sticky top-0 z-30 border-b border-foreground/10 bg-background"
    >
      <div className="flex h-12 items-center justify-between gap-2 px-6">
        {trip ? (
          // 旅行詳細: 戻る＋2行タイトル（iOS の旅行ナビバーと同じ形）。
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Link
              href="/trips"
              aria-label={backLabel}
              title={backLabel}
              className="-ml-2 shrink-0 rounded-full p-1.5 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
            >
              <ChevronIcon size={20} className="rotate-180" />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                {trip.title}
              </p>
              <p className="flex items-center gap-2 truncate text-[11px] leading-tight text-muted-foreground">
                {trip.subtitle}
              </p>
            </div>
          </div>
        ) : (
          <Link href="/trips" className="text-lg font-semibold tracking-tight">
            triplot
          </Link>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {tripActions}
          <ImportSheetButton count={importCount} />
          <AccountMenu
            email={user.email ?? null}
            name={accountName}
            avatarUrl={avatarUrl}
            isAdmin={profile?.is_admin ?? false}
            openFeedbackCount={openFeedbackCount}
            deployEnv={getDeployEnv()}
            version={getVersion()}
            tripMenu={tripMenu}
            tripRows={tripRows}
            currentTheme={currentTheme}
          />
        </div>
      </div>
    </header>
  );
}

// 2行タイトルの2行目（日程 ｜ 精算通貨）。旅行詳細のページから渡す。
export function TripHeaderSubtitle({
  dateRange,
  currencyLabel,
}: {
  dateRange: string;
  currencyLabel: string;
}) {
  return (
    <>
      {dateRange && <span className="truncate">{dateRange}</span>}
      {dateRange && <InlineDivider />}
      <span className="shrink-0">{currencyLabel}</span>
    </>
  );
}
