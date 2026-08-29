"use client";

import { useLocale, useTranslations } from "next-intl";

import {
  confirmSiblingDrafts,
  dismissSiblingDrafts,
} from "@triplot/shared/data/inbox";

import { toast } from "@/components/toast";
import { createClient } from "@/lib/supabase/client";

// 「同じメールから出た残りの下書きも確定/破棄する」の web 側の口。
// shared は i18n を知らないので、翻訳カタログ由来の文言だけここで注入する
// （RN 側の対は apps/mobile/src/lib/useSiblingConfirm.ts）。
export function useSiblingConfirm(tripId: string, myMemberId: string) {
  const t = useTranslations();
  const locale = useLocale();

  // 確定した下書きの相方（同じメールの残り）も確定する。作られたものは
  // 画面に出るが、**今開いていたフォームとは別のタブに出る**ので、何が
  // 増えたのかはトーストで伝える（フィードバック節「結果が見えない成功」）。
  const confirmSiblings = async (
    emailIds: string[],
    excludeDraftIds: string[],
  ) => {
    const r = await confirmSiblingDrafts(createClient(), {
      tripId,
      myMemberId,
      emailIds,
      excludeDraftIds,
      labels: {
        locale,
        untitledLabel: t("common.untitledEvent"),
        unknownMerchantLabel: t("import.unknownMerchant"),
        reservationRefLabel: (ref) =>
          t("tripDetail.reservationRefNote", { ref }),
      },
    });
    if (!r.ok) return;
    const { expenses, events, needsRateDraftId } = r.data;
    if (expenses > 0 && events > 0) toast(t("import.siblingConfirmedBoth"));
    else if (expenses > 0) toast(t("import.siblingConfirmedExpense"));
    else if (events > 0) toast(t("import.siblingConfirmedEvent"));
    // **黙って終わらせない。** 為替レートが決められない外貨の費用は作れないが、
    // それを伝えていなかったので「連動確定が効いていない」ようにしか見えなかった
    // （実データで USD のレシート 75 件が残っていた）。1件手で確定すれば、その
    // 実効レートの平均で残りは自動で通るようになる。
    if (needsRateDraftId) toast(t("import.siblingNeedsRate"));
  };

  const dismissSiblings = (emailIds: string[]) =>
    dismissSiblingDrafts(createClient(), emailIds);

  return { confirmSiblings, dismissSiblings };
}
