"use client";

import { useTranslations } from "next-intl";


import { CloseButton } from "./close-button";

// 受信箱のメール破棄（×）。取り消せない操作なので、他の破壊的操作と同じく
// confirmDialog を挟んでから呼ぶ（form action への直接 submit はしない）。
export function DismissEmailButton({
  id,
  onDismiss,
  className,
}: {
  id: string;
  // 確認が済んだ後に呼ばれる。実際の書き込みと再取得は呼び出し側。
  onDismiss: (id: string) => void;
  className?: string;
}) {
  const t = useTranslations("import");

  // 確認は挟まない。破棄した直後にトーストから戻せるので、確認とアンドゥの
  // どちらか一方という規則の「アンドゥ側」を採る（ui-guidelines「確認の要否は
  // 復旧コストで決める」）。
  const onClick = () => onDismiss(id);

  return (
    <CloseButton label={t("dismiss")} onClick={onClick} className={className} />
  );
}
