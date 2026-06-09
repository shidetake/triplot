"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LogOutIcon, SettingsIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

// 右上のアカウントメニュー。アバター（Google 写真があれば写真、無ければ頭文字の丸）を
// タップするとドロップダウンで email / 設定 / ログアウト。Apple ログインは写真を返さない
// ので頭文字フォールバックが効く（docs/design-guidelines.md のアバター項）。
export function AccountMenu({
  email,
  name,
  avatarUrl,
}: {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase() || "?";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.refresh();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="アカウント"
        title={email ?? "アカウント"}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-sm font-medium text-white ring-1 ring-zinc-200 transition hover:ring-zinc-300"
      >
        {avatarUrl ? (
          // 外部（Google）のアバター URL。next/image のドメイン設定を増やさず素の img で。
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
        >
          {email && (
            <div className="truncate border-b border-zinc-100 px-3 py-2 text-xs text-zinc-500">
              {email}
            </div>
          )}
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
          >
            <SettingsIcon size={16} />
            設定
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
          >
            <LogOutIcon size={16} />
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
