"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { THEME_COOKIE, type Theme } from "@/i18n/theme";

const seg =
  "flex flex-1 cursor-pointer items-center justify-center rounded px-2 py-1.5 text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// テーマをクライアント側で即時反映し、Cookie に保存する。
// コンポーネント外に置くことで react-hooks/immutability を回避しつつ、
// Server Action を使わずに Cookie を書く（Server Action 経由にすると
// React の自動再レンダリングが dark クラスを上書きしてしまう）。
// system のときは OS 変更リスナーを管理し、他テーマへ切替えたら解除する。
function applyThemeClient(
  value: Theme,
  mqRef: React.MutableRefObject<MediaQueryList | null>,
  listenerRef: React.MutableRefObject<((e: MediaQueryListEvent) => void) | null>,
) {
  if (listenerRef.current && mqRef.current) {
    mqRef.current.removeEventListener("change", listenerRef.current);
    listenerRef.current = null;
    mqRef.current = null;
  }
  if (value === "dark") {
    document.documentElement.classList.add("dark");
  } else if (value === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    document.documentElement.classList.toggle("dark", mq.matches);
    const h = (e: MediaQueryListEvent) =>
      document.documentElement.classList.toggle("dark", e.matches);
    mq.addEventListener("change", h);
    mqRef.current = mq;
    listenerRef.current = h;
  }
  document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function ThemeForm({ currentTheme }: { currentTheme: Theme }) {
  const t = useTranslations("settings");
  const [current, setCurrent] = useState<Theme>(currentTheme);

  const mqRef = useRef<MediaQueryList | null>(null);
  const listenerRef = useRef<((e: MediaQueryListEvent) => void) | null>(null);

  const pick = (value: Theme) => {
    if (value === current) return;
    setCurrent(value);
    applyThemeClient(value, mqRef, listenerRef); // クラス更新 + Cookie 保存
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
              onChange={() => pick(o.value)}
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
