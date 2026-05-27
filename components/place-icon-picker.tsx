"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import {
  addTripPinOptionAction,
  removeTripPinOptionAction,
} from "@/app/trips/[tripId]/actions";
import { ICON_CATALOG, getIcon, type PinOption } from "@/lib/placeIcons";

import { PlaceIcon } from "./place-list";

// 場所ピンの管理ピッカー。カタログ全件を 1 つの grid にフラットに並べる
// （カテゴリは内部の sort 順保持のためだけに残してて UI には出さない）。
//
// 既追加のアイコンは fade + クリック不可で「もう持ってる」と分かるようにし、
// 右上の × バッジで削除できる。未追加のアイコンはクリックで選択 → 「追加」で
// trip_pin_options に insert、その icon キーを onAdded で親に返す（親は
// dropdown 選択をその新しい key に切替える）。
//
// 閉じる経路: Esc / 背景クリック / キャンセルボタン。
export function PlaceIconPicker({
  tripId,
  pinOptions,
  onAdded,
  onClose,
}: {
  tripId: string;
  pinOptions: PinOption[];
  onAdded: (iconKey: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const optionByIcon = useMemo(
    () => new Map(pinOptions.map((o) => [o.icon, o])),
    [pinOptions],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedEntry = selected ? getIcon(selected) : null;

  const submitAdd = () => {
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

  const submitRemove = (opt: PinOption) => {
    if (isPending) return;
    if (!confirm(`「${opt.label}」を外しますか？\n（既にこのアイコンを使ってる場所はそのまま残ります）`)) {
      return;
    }
    setError(null);
    start(async () => {
      const { error } = await removeTripPinOptionAction(tripId, opt.id);
      if (error) setError(error);
      // 削除成功 → 親 revalidate で pinOptions 更新 → 自動 re-render
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
        {/* タイトル / 閉じる × は省略（grid と footer に面積を回す）。
            閉じる手段は Esc / 背景クリック / キャンセルボタンの 3 経路あり。 */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-8 gap-px">
            {ICON_CATALOG.map((it) => {
              const usedOpt = optionByIcon.get(it.key);
              const used = !!usedOpt;
              const sel = selected === it.key;
              return (
                <div key={it.key} className="relative">
                  <button
                    type="button"
                    onClick={() => !used && setSelected(it.key)}
                    disabled={used || isPending}
                    title={it.label}
                    aria-pressed={sel}
                    className={`flex h-9 w-full items-center justify-center rounded-md transition ${
                      sel
                        ? "bg-blue-100 text-blue-900"
                        : used
                          ? "cursor-not-allowed text-zinc-900 opacity-25"
                          : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <PlaceIcon icon={it.key} size={20} />
                  </button>
                  {used && usedOpt && (
                    <button
                      type="button"
                      onClick={() => submitRemove(usedOpt)}
                      disabled={isPending}
                      aria-label={`${it.label} を外す`}
                      title={`${it.label} を外す`}
                      className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-500 text-[9px] leading-none text-white transition hover:bg-red-500 disabled:opacity-50"
                    >
                      ×
                    </button>
                  )}
                </div>
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
              onClick={submitAdd}
              disabled={!selected || isPending}
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
