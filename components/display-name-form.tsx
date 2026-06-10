"use client";

import { useState, useTransition } from "react";

import { updateDisplayNameAction } from "@/app/settings/actions";
import { HelpTip } from "@/components/help-tip";
import { CheckIcon, SaveIcon } from "@/components/icons";

// 既定表示名の編集フォーム。保存しても入力値は変わらず「保存された感」が無いので、
// 成功時に「✓ 保存しました」を出す（編集し直すと消える）。
export function DisplayNameForm({ defaultValue }: { defaultValue: string }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await updateDisplayNameAction(formData);
          setSaved(true);
        })
      }
      className="flex flex-1 items-center gap-3"
    >
      <input
        type="text"
        name="display_name"
        defaultValue={defaultValue}
        placeholder="名前"
        maxLength={50}
        onChange={() => setSaved(false)}
        className="h-9 min-w-0 max-w-[12rem] flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:border-primary focus:outline-none"
      />
      <HelpTip label="デフォルト表示名について" align="right">
        旅行に参加するときのデフォルト表示名です（既存の旅行の表示名は変わりません）。
      </HelpTip>
      <button
        type="submit"
        disabled={pending}
        aria-label="保存"
        title="保存"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
      >
        <SaveIcon size={18} />
      </button>
      {saved && !pending && (
        <span className="flex items-center gap-1 whitespace-nowrap text-xs text-zinc-500">
          <CheckIcon size={14} /> 保存しました
        </span>
      )}
    </form>
  );
}
