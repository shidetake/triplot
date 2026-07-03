"use client";

import { useTranslations } from "next-intl";

import { ExpenseForm } from "./expense-form";
import { ImportDraftRow } from "./import-draft-row";

// 取り込み下書き（費用）の「確定」。クリックで事前入力済みの費用フォームを開き、
// 追加成功時に下書きを confirmed（作成した費用の id 付き）にして一覧から消す。
// props は ExpenseForm にそのまま渡す（旅行画面が文脈を全部持っている）。
type Props = Omit<
  React.ComponentProps<typeof ExpenseForm>,
  "onDone" | "onSuccess"
> & {
  draftId: string;
  labelParts: string[];
};

export function DraftConfirmButton({
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
      draftKey={`expense:import:${draftId}`}
    >
      {({ confirmDraft, close }) => (
        <ExpenseForm
          {...formProps}
          onSuccess={(expenseId) => void confirmDraft({ expenseId })}
          onDone={close}
        />
      )}
    </ImportDraftRow>
  );
}
