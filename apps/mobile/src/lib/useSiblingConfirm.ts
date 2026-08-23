import { useLocale, useTranslations } from "use-intl";

import {
  confirmSiblingDrafts,
  dismissSiblingDrafts,
} from "@triplot/shared/data/inbox";

import { toast } from "@/components/toast";
import { supabase } from "@/lib/supabase";

// 「同じメールから出た残りの下書きも確定/破棄する」の RN 側の口。
// shared は i18n を知らないので、翻訳カタログ由来の文言だけここで注入する
// （web 側の対は apps/web/lib/import/sibling-confirm.ts）。
//
// myMemberId が undefined を取れるのは、**呼び出し側が読み込み中の早期
// return より前でこのフックを呼ぶ**ため（旅行画面は data 未着の間 null を
// 返す。ガードの後ろでフックを呼ぶと、描画ごとにフックの数が変わって
// React が落ちる＝実際に旅行詳細を開けなくなった）。まだ自分が分からない
// 間は何もしない。
export function useSiblingConfirm(
  tripId: string,
  myMemberId: string | undefined,
) {
  const t = useTranslations();
  const locale = useLocale();

  // 確定した下書きの相方（同じメールの残り）も確定する。作られたものは
  // 別のタブに出るので、何が増えたのかはトーストで伝える。
  const confirmSiblings = async (
    emailIds: string[],
    excludeDraftIds: string[],
  ) => {
    if (!myMemberId) return;
    const r = await confirmSiblingDrafts(supabase, {
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
    const { expenses, events } = r.data;
    if (expenses > 0 && events > 0) toast(t("import.siblingConfirmedBoth"));
    else if (expenses > 0) toast(t("import.siblingConfirmedExpense"));
    else if (events > 0) toast(t("import.siblingConfirmedEvent"));
  };

  const dismissSiblings = (emailIds: string[]) =>
    dismissSiblingDrafts(supabase, emailIds);


  return { confirmSiblings, dismissSiblings };
}
