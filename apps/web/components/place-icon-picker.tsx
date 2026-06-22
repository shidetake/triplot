"use client";

import { useMemo, useState, useTransition } from "react";

import { Dialog } from "@base-ui/react/dialog";

import {
  addTripPinOptionAction,
  removeTripPinOptionAction,
} from "@/app/trips/[tripId]/actions";
import { ICON_CATALOG, getIcon, type PinOption } from "@triplot/shared/placeIcons";
import { Button } from "@/components/ui/button";

import { confirmDialog } from "./confirm-dialog";
import { PlaceIcon } from "./place-list";

// 場所ピンの管理ピッカー。カタログ全件を 1 つの grid にフラットに並べる
// （カテゴリは内部の sort 順保持のためだけに残してて UI には出さない）。
//
// 既追加のアイコンは fade で「もう持ってる」と分かるが、選択は可能 →
// その状態で下のボタンが「削除」に切り替わる。未追加は同様に選択 → 「追加」。
// 1 つのアクションボタンで CRUD 両対応にして、追加用 × バッジの視覚ノイズを避ける。
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

  const selectedEntry = selected ? getIcon(selected) : null;
  const selectedOption = selected ? optionByIcon.get(selected) : null;
  const mode: "add" | "remove" = selectedOption ? "remove" : "add";

  const submit = async () => {
    if (!selected || isPending) return;
    setError(null);
    if (selectedOption) {
      // 削除
      const ok = await confirmDialog({
        title: `「${selectedOption.label}」を外しますか？`,
        body: "既にこのアイコンを使ってる場所はそのまま残ります。",
        confirmLabel: "外す",
      });
      if (!ok) return;
      const opt = selectedOption;
      start(async () => {
        const { error } = await removeTripPinOptionAction(tripId, opt.id);
        if (error) {
          setError(error);
          return;
        }
        // 削除後はそのアイコンが「未追加」に変わるので選択も解除
        setSelected(null);
      });
    } else {
      // 追加
      start(async () => {
        const { error } = await addTripPinOptionAction(tripId, selected);
        if (error) {
          setError(error);
          return;
        }
        onAdded(selected);
      });
    }
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        {/* タイトル / 閉じる × は省略（grid と footer に面積を回す）。
            閉じる手段は Esc / 背景クリック / キャンセルボタンの 3 経路（Base UI が担保）。 */}
        <Dialog.Popup
          aria-label="ピンのアイコンを選ぶ"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-white shadow-xl outline-none"
        >
        <div className="flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-8 gap-px">
            {ICON_CATALOG.filter((it) => it.key !== "pin").map((it) => {
              const used = optionByIcon.has(it.key);
              const sel = selected === it.key;
              // 選択ハイライトは状態で色を変える: 未追加=青(追加候補)、
              // 追加済=赤(削除候補)。下のボタン色とも揃う。
              const selectedClass = used
                ? "bg-red-100 text-red-900"
                : "bg-blue-100 text-blue-900";
              // 追加済みは「状態 dim」= アイコンを opacity-50（ui-guidelines
              // 「薄くする手段」）。ホバーは未追加と同じ標準の bg-foreground/10。
              const idleClass = used
                ? "text-foreground hover:bg-foreground/10"
                : "text-muted-foreground hover:bg-foreground/10";
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => setSelected(it.key)}
                  disabled={isPending}
                  title={it.label}
                  aria-pressed={sel}
                  className={`flex h-9 items-center justify-center rounded-md transition ${
                    sel ? selectedClass : idleClass
                  } disabled:cursor-not-allowed`}
                >
                  <PlaceIcon
                    icon={it.key}
                    size={20}
                    className={used ? "opacity-50" : ""}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <footer className="border-t border-foreground/5">
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
            選択中:
            {selectedEntry ? (
              <>
                <span className="inline-flex items-center text-foreground">
                  <PlaceIcon icon={selectedEntry.key} size={20} />
                </span>
                <span className="font-medium text-foreground">
                  {selectedEntry.label}
                </span>
              </>
            ) : (
              <span className="text-subtle-foreground">未選択</span>
            )}
          </div>
          {error && (
            <p className="px-4 pb-2 text-xs text-red-600">{error}</p>
          )}
          <div className="flex justify-end gap-2 px-4 pb-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant={mode === "remove" ? "destructive" : "primary"}
              onClick={submit}
              disabled={!selected || isPending}
            >
              {isPending
                ? mode === "remove"
                  ? "削除中..."
                  : "追加中..."
                : mode === "remove"
                  ? "削除"
                  : "追加"}
            </Button>
          </div>
        </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
