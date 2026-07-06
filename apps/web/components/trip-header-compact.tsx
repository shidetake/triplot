import Link from "next/link";
import type { ReactNode } from "react";

import { ChevronIcon } from "@/components/icons";
import { MemberAvatar } from "@/components/member-avatar";

// 狭い画面（タブ化したモバイル）専用の1行ヘッダー。従来の「戻る＋タイトル＋日程＋
// 精算通貨＋メンバー」の縦積みブロックは全タブで繰り返され面積を取りすぎるため、
// h-11(44px) の単一行に圧縮する。広い画面は元のブロックのまま（page.tsx 側で
// hidden md:block）。
export function TripHeaderCompact({
  backLabel,
  tripTitle,
  dateRangeShort,
  members,
  actions,
}: {
  backLabel: string;
  tripTitle: string;
  dateRangeShort: string;
  members: {
    id: string;
    display_name: string;
    color: number | null;
    avatarUrl: string | null;
  }[];
  // TripActions（⋯メニュー）を呼び出し側から渡す。同じインスタンスを広い画面側と
  // 二重マウントする形になるが、開くまでネットワークアクセスしないコンポーネントなので無害。
  actions: ReactNode;
}) {
  return (
    // data-mobile-chrome-top: AppHeader と同じく、狭い画面のボトムシートが
    // 開いた時にこの帯の下端まで見せる実測対象（use-mobile-chrome-margins.ts）。
    <div
      data-mobile-chrome-top
      className="flex h-11 items-center gap-2 border-b border-foreground/10 px-3 md:hidden"
    >
      <Link
        href="/trips"
        aria-label={backLabel}
        title={backLabel}
        className="shrink-0 rounded-full p-1.5 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
      >
        <ChevronIcon size={18} className="rotate-180" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">
          {tripTitle}
        </p>
        {dateRangeShort && (
          <p className="truncate text-[10px] leading-tight text-muted-foreground">
            {dateRangeShort}
          </p>
        )}
      </div>
      {members.length > 0 && (
        <div className="flex shrink-0 -space-x-1.5">
          {members.slice(0, 3).map((m) => (
            <MemberAvatar
              key={m.id}
              name={m.display_name}
              color={m.color}
              imageUrl={m.avatarUrl}
              size="sm"
              className="ring-2 ring-background"
            />
          ))}
        </div>
      )}
      {actions}
    </div>
  );
}
