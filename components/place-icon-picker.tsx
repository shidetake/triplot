"use client";

import { useEffect, useState, useTransition } from "react";

import { addTripPinOptionAction } from "@/app/trips/[tripId]/actions";
import { ICON_CATALOG, getIcon } from "@/lib/placeIcons";

import { CloseIcon } from "./icons";
import { PlaceIcon } from "./place-list";

// 場所ピンの追加ピッカー。カタログ全件を 1 つの grid にフラットに並べる
// （カテゴリは内部の sort 順保持のためだけに残してて UI には出さない）。
// トリップに既に追加済みのアイコンは fade + クリック不可。
// 確定で trip_pin_options に行を1つ insert し、追加された icon キーを
// onAdded で親に返す（親は dropdown 選択をその新しい key に切替える）。
export function PlaceIconPicker({
  tripId,
  usedKeys,
  onAdded,
  onClose,
}: {
  tripId: string;
  usedKeys: Set<string>;
  onAdded: (iconKey: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Esc で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedEntry = selected ? getIcon(selected) : null;

  const submit = () => {
    if (!selected || isPending) return;
    setError(null);
    start(async () => {
      const { error } = await addTripPinOptionAction(tripId, selected);
      if (error) {
        setError(error);
        return;
      }
      onAdded(selected);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <span className="text-sm font-semibold">アイコンを追加</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100"
          >
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-8 gap-px">
            {ICON_CATALOG.map((it) => {
              const used = usedKeys.has(it.key);
              const sel = selected === it.key;
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => setSelected(it.key)}
                  disabled={used}
                  title={it.label}
                  aria-pressed={sel}
                  className={`flex h-9 items-center justify-center rounded-md transition ${
                    sel
                      ? "bg-blue-100 text-blue-900"
                      : used
                        ? "cursor-not-allowed text-zinc-900 opacity-25"
                        : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <PlaceIcon icon={it.key} size={20} />
                </button>
              );
            })}
          </div>
        </div>

        <footer className="border-t border-zinc-100">
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-500">
            選択中:
            {selectedEntry ? (
              <>
                <span className="inline-flex items-center text-zinc-900">
                  <PlaceIcon icon={selectedEntry.key} size={20} />
                </span>
                <span className="font-medium text-zinc-900">
                  {selectedEntry.label}
                </span>
              </>
            ) : (
              <span className="text-zinc-400">未選択</span>
            )}
          </div>
          {error && (
            <p className="px-4 pb-2 text-xs text-red-600">{error}</p>
          )}
          <div className="flex justify-end gap-2 px-4 pb-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!selected || isPending || (selected && usedKeys.has(selected)) || false}
              className="rounded-lg bg-black px-4 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
            >
              {isPending ? "追加中..." : "追加"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

