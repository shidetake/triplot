"use client";

import { useState, useTransition } from "react";

import { updateDisplayNameAction } from "@/app/settings/actions";
import { HelpTip } from "@/components/help-tip";
import { SaveIcon } from "@/components/icons";
import { toast } from "@/components/toast";

// 既定表示名の編集フォーム。
//  - 保存しても入力値は変わらず「保存された感」が無いので、成功時にトーストで知らせる。
//  - 変更がある時だけ保存ボタンを有効に（無駄押し防止のユーザビリティ。状態表示が目的ではない）。
export function DisplayNameForm({ defaultValue }: { defaultValue: string }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(defaultValue);
  const [saved, setSaved] = useState(defaultValue);
  const dirty = value.trim() !== saved.trim();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await updateDisplayNameAction(formData);
          setSaved(value);
          toast("保存しました");
        })
      }
      className="flex flex-1 items-center gap-3"
    >
      <input
        type="text"
        name="display_name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="名前"
        maxLength={50}
        className="h-9 min-w-0 max-w-[12rem] flex-1 rounded-md border border-foreground/20 bg-white px-3 text-sm focus:border-primary focus:outline-none"
      />
      <HelpTip label="デフォルト表示名について" align="right">
        旅行に参加するときのデフォルト表示名です（既存の旅行の表示名は変わりません）。
      </HelpTip>
      <button
        type="submit"
        disabled={pending || !dirty}
        aria-label="保存"
        title="保存"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
      >
        <SaveIcon size={18} />
      </button>
    </form>
  );
}
