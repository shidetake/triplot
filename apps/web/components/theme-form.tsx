"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setThemeAction } from "@/app/settings/actions";
import type { Theme } from "@/i18n/theme";

const seg =
  "flex flex-1 cursor-pointer items-center justify-center rounded px-2 py-1.5 text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

export function ThemeForm({ currentTheme }: { currentTheme: Theme }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState<Theme>(currentTheme);

  const pick = (value: Theme) => {
    if (value === current || pending) return;
    setCurrent(value);
    startTransition(async () => {
      await setThemeAction(value);
      router.refresh();
    });
  };

  const OPTIONS: { value: Theme; label: string }[] = [
    { value: "light",  label: t("themeLight") },
    { value: "dark",   label: t("themeDark") },
    { value: "system", label: t("themeSystem") },
  ];

  return (
    <div className="flex gap-1 rounded-md border border-foreground/10 p-1">
      {OPTIONS.map((o) => {
        const active = o.value === current;
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
              name="theme"
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
