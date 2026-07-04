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
  labelParts: string[];
};

export function EventDraftConfirmButton({
  draftId,
  labelParts,
  ...formProps
}: Props) {
  const t = useTranslations("import");

  return (
    <ImportDraftRow
      draftId={draftId}
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
