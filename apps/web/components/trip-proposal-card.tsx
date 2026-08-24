"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { formatTripDateRange } from "@triplot/shared/ymd";

import { type CopyableTrip, CreateTripForm } from "./create-trip-form";
import { type Anchor, FormPopover } from "./form-popover";

// 旅行の候補（仮旅行）。まだ作っていない旅行の証拠になる下書き
// （移動・宿泊）を日付でまとめたもの。押すと旅行作成フォームが日程と
// 名前を埋めた状態で開き、作れば普通の旅行になる。
//
// 破線の枠は「ここに追加できる」の表現（ui-guidelines「定型部品」）。
// 実在の旅行と同じ実線のカードにすると、もう存在する旅行に見えてしまう。
export function TripProposalCard({
  proposal,
  defaultDisplayName,
  trips,
}: {
  proposal: {
    title: string | null;
    startDate: string;
    endDate: string;
    emailIds: string[];
  };
  defaultDisplayName?: string | null;
  trips: CopyableTrip[];
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const t = useTranslations("trips");
  const locale = useLocale();
  const range = formatTripDateRange(
    proposal.startDate,
    proposal.endDate,
    locale,
  );

  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        className="block w-full rounded-md border border-dashed border-foreground/20 p-4 text-left transition hover:border-foreground/40 hover:bg-foreground/10"
      >
        <div className="text-xs text-muted-foreground">{t("proposal")}</div>
        <div className="mt-1 font-medium">{proposal.title ?? range}</div>
        <div className="mt-1 text-sm text-muted-foreground">{range}</div>
      </button>

      {anchor && (
        <FormPopover
          anchor={anchor}
          onClose={() => setAnchor(null)}
          label={t("create")}
          fullScreenOnNarrow
          draftKey={`trip:proposal:${proposal.emailIds.join(",")}`}
        >
          <CreateTripForm
            defaultDisplayName={defaultDisplayName}
            trips={trips}
            proposal={proposal}
            onDone={() => setAnchor(null)}
          />
        </FormPopover>
      )}
    </>
  );
}
