"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  type CategoryMutationState,
} from "@/app/trips/[tripId]/categories/actions";
import { toast } from "@/components/toast";
import { confirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CloseButton } from "./close-button";
import { FieldLabel } from "./field-label";
import { useInSheet } from "./form-host";
import { SaveIcon, TrashIcon } from "./icons";
import { MessageBox } from "./message-box";
import { ExpenseCategoryIcon } from "./expense-category-icon";

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#10b981", "#06b6d4", "#3b82f6",
  "#6366f1", "#a855f7", "#ec4899", "#f43f5e",
  "#71717a", "#6b7280", "#0ea5e9", "#14b8a6",
];

// expense-category-icon.tsx の EXPENSE_ICON_PATHS と同期。celebration は
// 旧「エンタメ」の fallback だが、ピッカーには出す（有効なアイコン）。
const ICONS = [
  "flight", "tram", "restaurant", "checkroom",
  "local_activity", "redeem", "hotel", "wifi",
  "local_hospital", "casino", "category", "celebration",
];

export type CategoryFormValue = {
  id: string;
  name: string;
  color: string;
  icon: string;
  // null = カスタム（name をそのまま表示）、string = デフォルト（i18n キー）
  key: string | null;
};

const initialState: CategoryMutationState = { error: null, ok: false };

export function CategoryForm({
  tripId,
  category,
  onDone,
}: {
  tripId: string;
  category?: CategoryFormValue;
  onDone?: () => void;
}) {
  const inSheet = useInSheet();
  const t = useTranslations("categories");
  const tExp = useTranslations("expense");

  const isEdit = !!category;
  const initColor = category?.color ?? COLORS[7];
  const initIcon = category?.icon ?? "category";
  // key があれば i18n カタログから表示名を引く（編集前の表示と一致させる）
  const initName = category
    ? (category.key ? tExp(`cat.${category.key}`) : category.name)
    : "";

  const [color, setColor] = useState(initColor);
  const [icon, setIcon] = useState(initIcon);

  const action = isEdit
    ? updateCategoryAction.bind(null, category.id, tripId)
    : createCategoryAction.bind(null, tripId);

  const [state, formAction, isPending] = useActionState(action, initialState);
  const [isDeleting, startDelete] = useTransition();

  useEffect(() => {
    if (state.ok) {
      toast(t("saveOk"));
      onDone?.();
    }
  }, [state.ok, onDone, t]);

  const onDelete = () => {
    if (!category) return;
    startDelete(async () => {
      const ok = await confirmDialog({ title: t("deleteConfirmTitle") });
      if (!ok) return;
      const res = await deleteCategoryAction(category.id, tripId);
      if (res.error) {
        toast(res.error);
      } else {
        toast(t("deleteOk"));
        onDone?.();
      }
    });
  };

  return (
    <form
      action={formAction}
      className="relative space-y-3 rounded-md border border-foreground/10 bg-background p-4"
    >
      {!inSheet && (
        <CloseButton onClick={onDone} className="absolute right-2 top-2 z-10" />
      )}

      {/* プレビュー + 名前入力 */}
      <div className="flex items-center gap-3">
        <span
          className="block h-8 w-8 shrink-0 rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          <ExpenseCategoryIcon icon={icon} size={32} inset={0.18} />
        </span>
        <label className="block min-w-0 flex-1 text-sm">
          <FieldLabel required>{t("nameLabel")}</FieldLabel>
          <Input
            name="name"
            required
            placeholder={t("namePlaceholder")}
            defaultValue={initName}
            className="mt-1 block w-full min-w-0"
          />
        </label>
      </div>

      {/* 色ピッカー */}
      <div className="text-sm">
        <FieldLabel>{t("colorLabel")}</FieldLabel>
        <input type="hidden" name="color" value={color} />
        <div className="mt-1.5 grid grid-cols-8 gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="relative flex h-7 w-7 items-center justify-center rounded-full transition"
              style={{ backgroundColor: c }}
              aria-label={c}
              aria-pressed={color === c}
              title={c}
            >
              {color === c && (
                <span className="text-xs font-bold text-white">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* アイコンピッカー */}
      <div className="text-sm">
        <FieldLabel>{t("iconLabel")}</FieldLabel>
        <input type="hidden" name="icon" value={icon} />
        <div className="mt-1.5 grid grid-cols-6 gap-1.5">
          {ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => setIcon(ic)}
              aria-label={ic}
              aria-pressed={icon === ic}
              title={ic}
              className="flex h-9 w-9 items-center justify-center rounded-md border transition"
              style={
                icon === ic
                  ? { backgroundColor: color, color: "white", borderColor: color }
                  : { borderColor: "color-mix(in srgb, currentColor 20%, transparent)" }
              }
            >
              <ExpenseCategoryIcon icon={ic} size={20} />
            </button>
          ))}
        </div>
      </div>

      {/* フッター: 削除（編集時のみ）+ 保存 */}
      <div className="flex gap-2">
        {isEdit && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={onDelete}
            disabled={isDeleting || isPending}
            aria-label={t("delete")}
            title={t("delete")}
          >
            <TrashIcon size={18} />
          </Button>
        )}
        <Button
          type="submit"
          disabled={isPending || isDeleting}
          aria-label={t("save")}
          title={t("save")}
          className="flex-1"
        >
          <SaveIcon size={20} />
        </Button>
      </div>

      {state.error && <MessageBox kind="error">{state.error}</MessageBox>}
    </form>
  );
}
