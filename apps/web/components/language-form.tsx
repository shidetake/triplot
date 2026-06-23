"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setLocaleAction } from "@/app/settings/actions";

// 言語名は endonym（その言語自身での表記）で出す＝UI ロケールに依らず固定。
const OPTIONS = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
] as const;

// セグメントトラック（ui-guidelines「定型部品」）。native radio を sr-only で敷く。
const seg =
  "flex flex-1 cursor-pointer items-center justify-center rounded px-2 py-1.5 text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

export function LanguageForm() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const pick = (value: string) => {
    if (value === locale || pending) return;
    startTransition(async () => {
      await setLocaleAction(value);
      router.refresh();
    });
  };

  return (
    <div className="flex gap-1 rounded-md border border-foreground/10 p-1">
      {OPTIONS.map((o) => {
        const active = o.value === locale;
        return (
          <label
            key={o.value}
            className={`${seg} ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-foreground/10"
            }`}
          >
            <input
              type="radio"
              name="locale"
              className="sr-only"
              checked={active}
              disabled={pending}
              onChange={() => pick(o.value)}
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
