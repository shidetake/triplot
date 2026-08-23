"use client";

import { useTranslations } from "next-intl";

import { EventForm } from "./event-form";
import { ImportDraftRow } from "./import-draft-row";

// 取り込み下書き（予定）の「確定」。クリックで事前入力済みの予定フォームを開き、
// 追加成功時に下書きを confirmed（作成した予定の id 付き）にして一覧から消す。
// props は EventForm にそのまま渡す（state に create モード＋prefill を積んでおく）。
type Props = Omit<
  React.ComponentProps<typeof EventForm>,
  "onDone" | "onSuccess"
> & {
  draftId: string;
  // 重なりをまとめた予定は複数の下書き行を表す。
  draftIds: string[];
  emailIds: string[];
  myMemberId: string;
  labelParts: string[];
};

export function EventDraftConfirmButton({
  draftId,
  draftIds,
  emailIds,
  myMemberId,
  labelParts,
  ...formProps
}: Props) {
  const t = useTranslations("import");

  return (
    <ImportDraftRow
      draftId={draftId}
      draftIds={draftIds}
      emailIds={emailIds}
      tripId={formProps.tripId}
      myMemberId={myMemberId}
      labelParts={labelParts}
      formLabel={t("confirmFormLabel")}
      draftKey={`event:import:${draftId}`}
      truncateTail
    >
      {({ confirmDraft, close }) => (
        <EventForm
          {...formProps}
          onSuccess={(eventId) => void confirmDraft({ eventId })}
          onDone={close}
        />
      )}
    </ImportDraftRow>
  );
}
