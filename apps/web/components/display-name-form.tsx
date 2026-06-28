"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { updateDisplayNameAction } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
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
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await updateDisplayNameAction(formData);
          setSaved(value);
          toast(tc("saved"));
        })
      }
      className="flex flex-1 items-center gap-3"
    >
      <input
        type="text"
        name="display_name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("namePlaceholder")}
        maxLength={50}
        className="h-9 min-w-0 max-w-[12rem] flex-1 rounded-md border border-foreground/20 bg-background px-3 text-sm focus:border-primary focus:outline-none"
      />
      <HelpTip label={t("displayNameHelpLabel")} align="right">
        {t("displayNameHelp")}
      </HelpTip>
      <Button
        type="submit"
        size="icon"
        disabled={pending || !dirty}
        aria-label={tc("save")}
        title={tc("save")}
        className="shrink-0"
      >
        <SaveIcon size={18} />
      </Button>
    </form>
  );
}
