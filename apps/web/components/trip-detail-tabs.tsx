"use client";

import { useTranslations } from "next-intl";

import {
  CalendarDaysIcon,
  ListTodoIcon,
  MapIcon,
  WalletIcon,
} from "@/components/icons";
import {
  setActiveTripTab,
  useActiveTripTab,
  type TripTabKey as TabKey,
} from "@/lib/activeTripTab";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "schedule", Icon: CalendarDaysIcon },
  { key: "places", Icon: MapIcon },
  { key: "expenses", Icon: WalletIcon },
  { key: "todos", Icon: ListTodoIcon },
] as const satisfies { key: TabKey; Icon: unknown }[];

// 狭い画面（< md=768px）だけタブ化し、広い画面は今までどおり全セクション縦積み
// （旅行詳細のコンテナ幅 max-w-3xl=768px を下回ると縦積みの同時表示の旨味が
// 落ちるため、そこで切り替える）。表示の出し分けは Tailwind の
// "hidden md:block" だけで行い、JS のメディアクエリ判定は使わない
// （SSR とクライアントの初期描画を一致させ hydration mismatch を避ける）。
//
// タブ切替は実ナビゲーションにしない（案B）: 4セクションは常にマウントされたまま
// CSS で表示/非表示するだけなので、地図インスタンス・スクロール位置・入力途中の
// フォームが切替をまたいで生き続ける。URL 同期は history.replaceState のみで
// 行い、Next.js のルーターは経由しない（戻るボタンでタブ履歴が積まれない）。
export function TripDetailTabs({
  schedule,
  places,
  expenses,
  todos,
}: Record<TabKey, React.ReactNode>) {
  const t = useTranslations("tripTabs");
  const activeTab = useActiveTripTab();

  const content: Record<TabKey, React.ReactNode> = {
    schedule,
    places,
    expenses,
    todos,
  };

  return (
    <>
      {/* 狭い画面でだけ下の固定タブバー分の余白を確保。広い画面は不要（タブバー非表示）。
          全画面ブリードするタブ（予定のカレンダー・場所の地図）は各セクション内部で
          自身を position:fixed にして画面いっぱいに描く（lib/mobileTabChrome.ts）。
          ここでの出し分けは他タブと同じ hidden/block のみで統一する。 */}
      <div className="pb-24 md:pb-0">
        {TABS.map(({ key }) => (
          <div
            key={key}
            className={cn(key === activeTab ? "block" : "hidden", "md:block")}
          >
            {content[key]}
          </div>
        ))}
      </div>

      {/* data-mobile-chrome-bottom: 場所シートが「下端をこのタブバーの上まで」
          にする実測対象（use-mobile-chrome-margins.ts）。 */}
      <nav
        data-mobile-chrome-bottom
        aria-label={t("navLabel")}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-foreground/10 bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TABS.map(({ key, Icon }) => {
          const active = key === activeTab;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTripTab(key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon size={24} />
              <span>{t(key)}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
