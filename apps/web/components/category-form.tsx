"use client";

import { useActionState, useEffect, useTransition } from "react";
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

// カスタムカテゴリのアイコン・色は固定（「その他」と同じ汎用スタイル）
const CUSTOM_ICON = "category";
const CUSTOM_COLOR = "#71717a";

export type CategoryFormValue = {
  id: string;
  name: string;
  color: string;
  icon: string;
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

  const isEdit = !!category;
  const initName = category?.name ?? "";

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

      <div className="flex items-center gap-3">
        <span
          className="block h-8 w-8 shrink-0 rounded-full text-white"
          style={{ backgroundColor: CUSTOM_COLOR }}
        >
          <ExpenseCategoryIcon icon={CUSTOM_ICON} size={32} inset={0.18} />
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
