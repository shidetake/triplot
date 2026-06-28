"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { setThemeAction } from "@/app/settings/actions";
import type { Theme } from "@/i18n/theme";

const seg =
  "flex flex-1 cursor-pointer items-center justify-center rounded px-2 py-1.5 text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

// テーマをクライアント側で即時反映する。インラインスクリプト (layout.tsx) が
// 初回ロード時だけ走るため、クライアント切替後も同じロジックを呼ぶ。
// system のときは OS 変更リスナーを管理し、他のテーマに切替えたら解除する。
function applyThemeClient(
  value: Theme,
  mqRef: React.MutableRefObject<MediaQueryList | null>,
  listenerRef: React.MutableRefObject<((e: MediaQueryListEvent) => void) | null>,
) {
  // 既存の system リスナーを解除
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
}

export function ThemeForm({ currentTheme }: { currentTheme: Theme }) {
  const t = useTranslations("settings");
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState<Theme>(currentTheme);

  const mqRef = useRef<MediaQueryList | null>(null);
  const listenerRef = useRef<((e: MediaQueryListEvent) => void) | null>(null);

  // コンポーネント破棄時にリスナーをクリーンアップ
  useEffect(() => {
    return () => {
      if (listenerRef.current && mqRef.current) {
        mqRef.current.removeEventListener("change", listenerRef.current);
      }
    };
  }, []);

  const pick = (value: Theme) => {
    if (value === current || pending) return;
    setCurrent(value);
    applyThemeClient(value, mqRef, listenerRef);
    startTransition(async () => {
      await setThemeAction(value);
      // テーマ変更は純粋 CSS なので router.refresh() 不要。
      // Cookie が保存されるため次回ロードも正しいテーマで起動する。
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
