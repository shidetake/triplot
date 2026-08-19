"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { buildCopySourceLabels } from "@triplot/shared/copySourceLabel";
import { fetchImportInboxRows } from "@triplot/shared/data/reads/inbox";
import { buildImportAddress } from "@triplot/shared/importAddress";
import { deriveInboxRows } from "@triplot/shared/import/inboxRows";

import { InboxIcon } from "@/components/icons";
import { type Anchor, FormPopover } from "@/components/form-popover";
import { ImportInbox, type ImportInboxData } from "@/components/import-inbox";
import { createClient } from "@/lib/supabase/client";

// ヘッダーの受信箱ボタン。**ページに遷移せずその場で開く**。
//
// 以前は /import へのリンクだった。旅行詳細から開くと元の旅行に戻る道が無く、
// 旅行一覧まで戻って入り直す必要があった（ui-guidelines「全画面表示は使わない
// ＝文脈〔どこから開いたか〕が消えるため」に反していた）。狭い画面ではボトム
// シート、広い画面ではタップ位置のポップオーバーで開き、閉じれば元の画面に戻る。
// iOS も同じくシートで開く（app/(app)/trips/import）。
export function ImportSheetButton({ count }: { count: number }) {
  const t = useTranslations("header");
  const tImport = useTranslations("import");
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const label = count > 0 ? t("importWithCount", { count }) : t("import");

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
      >
        <InboxIcon size={24} />
        {count > 0 && (
          <span className="absolute right-0 top-0 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground ring-1 ring-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {anchor && (
        <FormPopover
          anchor={anchor}
          onClose={() => setAnchor(null)}
          label={tImport("heading")}
          fullScreenOnNarrow
        >
          <ImportSheetBody />
        </FormPopover>
      )}
    </>
  );
}

function ImportSheetBody() {
  const t = useTranslations("import");
  const [data, setData] = useState<ImportInboxData | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const raw = await fetchImportInboxRows(supabase, user.id);
      if (!alive) return;
      setData({
        importAddress: raw.importToken
          ? buildImportAddress(raw.importToken)
          : null,
        trips: raw.trips,
        tripLabel: buildCopySourceLabels(raw.trips),
        rows: deriveInboxRows(raw),
        errorRows: raw.errorRows ?? [],
        usedThisMonth: raw.usedThisMonth ?? 0,
        overQuota: raw.overQuota ?? 0,
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    // 広い画面のポップオーバーでも一覧が読める幅にする（狭い画面はシートが
    // 幅を持つので max-w だけ効く）。
    <div className="w-[min(34rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto p-4">
      <h2 className="text-lg font-semibold">{t("heading")}</h2>
      <div className="mt-3">
        {data ? <ImportInbox data={data} /> : <InboxSkeleton />}
      </div>
    </div>
  );
}

// 一覧がまるごと入れ替わる待ちなのでスケルトン
// （ui-guidelines「処理中（ローディング）」の3番目）。
function InboxSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-4 w-2/3 rounded bg-foreground/10" />
      <div className="h-4 w-1/3 rounded bg-foreground/10" />
      {[0, 1].map((i) => (
        <div
          key={i}
          className="space-y-2 rounded-lg border border-foreground/10 p-4"
        >
          <div className="h-4 w-1/2 rounded bg-foreground/10" />
          <div className="h-3 w-3/4 rounded bg-foreground/10" />
          <div className="h-8 w-2/3 rounded bg-foreground/10" />
        </div>
      ))}
    </div>
  );
}
