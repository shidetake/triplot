"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "@/app/trips/[tripId]/categories/actions";
import { toast } from "@/components/toast";
import { confirmDialog } from "@/components/confirm-dialog";
import { CloseIcon, PlusIcon, TrashIcon } from "./icons";
import { ExpenseCategoryIcon } from "./expense-category-icon";
import { inputClass } from "./input-class";

const CUSTOM_ICON = "category";
const CUSTOM_COLOR = "#71717a";

export type CategoryItem = {
  id: string;
  name: string;
  color: string;
  icon: string;
  key: string | null;
};

type EditState =
  | { kind: "idle" }
  | { kind: "editing"; id: string; originalName: string }
  | { kind: "adding" };

export function CategoryManagementList({
  tripId,
  categories,
}: {
  tripId: string;
  categories: CategoryItem[];
}) {
  const t = useTranslations("categories");
  const tc = useTranslations("common");
  const tExp = useTranslations("expense");

  const [editState, setEditState] = useState<EditState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  // blur で保存するとき、ゴミ箱クリックによる blur は無視する。
  // ゴミ箱は1つしか出ないので単一 ref で足りる。
  const trashRef = useRef<HTMLButtonElement>(null);

  const catName = (c: CategoryItem) =>
    c.key ? tExp(`cat.${c.key}`) : c.name;

  const cancel = () => setEditState({ kind: "idle" });

  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement>,
    onSave: (value: string) => void,
  ) => {
    if (e.relatedTarget === trashRef.current) return;
    onSave(e.currentTarget.value);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    onSave: (value: string) => void,
  ) => {
    if (e.key === "Enter") { e.preventDefault(); onSave(e.currentTarget.value); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  };

  const saveNew = (value: string) => {
    const name = value.trim();
    if (!name) { cancel(); return; }
    startTransition(async () => {
      const res = await createCategoryAction(tripId, name);
      if (res.error) toast(res.error);
      else cancel();
    });
  };

  const saveEdit = (id: string, value: string, originalName: string) => {
    const name = value.trim();
    // 空 or 変更なし → キャンセル扱い（削除しない）
    if (!name || name === originalName) { cancel(); return; }
    startTransition(async () => {
      const res = await updateCategoryAction(id, tripId, name);
      if (res.error) toast(res.error);
      else { toast(tc("saved")); cancel(); }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const ok = await confirmDialog({ title: t("deleteConfirmTitle") });
      if (!ok) return;
      const res = await deleteCategoryAction(id, tripId);
      if (res.error) toast(res.error);
      else { toast(t("deleteOk")); cancel(); }
    });
  };

  return (
    <div className="space-y-1">
      {categories.map((c) => {
        const isEditing =
          editState.kind === "editing" && editState.id === c.id;
        const isCustom = c.key == null;

        return (
          <div key={c.id} className="flex items-center gap-2">
            <span
              className="block h-6 w-6 shrink-0 rounded-full text-white"
              style={{ backgroundColor: isEditing ? CUSTOM_COLOR : c.color }}
            >
              <ExpenseCategoryIcon
                icon={isEditing ? CUSTOM_ICON : c.icon}
                size={24}
                inset={0.18}
              />
            </span>

            {isEditing ? (
              <>
                <input
                  autoFocus
                  defaultValue={editState.originalName}
                  disabled={isPending}
                  className={`flex-1 ${inputClass}`}
                  onBlur={(e) =>
                    handleBlur(e, (v) =>
                      saveEdit(c.id, v, editState.originalName),
                    )
                  }
                  onKeyDown={(e) =>
                    handleKeyDown(e, (v) =>
                      saveEdit(c.id, v, editState.originalName),
                    )
                  }
                />
                <button
                  ref={trashRef}
                  type="button"
                  onClick={() => handleDelete(c.id)}
                  disabled={isPending}
                  aria-label={tc("delete")}
                  title={tc("delete")}
                  className="shrink-0 rounded-md p-1.5 text-red-600 transition hover:bg-red-600/10 disabled:opacity-50"
                >
                  <TrashIcon size={16} />
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!isCustom || isPending}
                onClick={() =>
                  isCustom &&
                  setEditState({
                    kind: "editing",
                    id: c.id,
                    originalName: c.name,
                  })
                }
                className={`flex-1 truncate rounded px-1 py-1.5 text-left text-sm transition ${
                  isCustom
                    ? "hover:bg-foreground/10"
                    : "cursor-default text-foreground"
                }`}
              >
                {catName(c)}
              </button>
            )}
          </div>
        );
      })}

      {/* 追加行 */}
      {editState.kind === "adding" ? (
        <div className="flex items-center gap-2">
          <span
            className="block h-6 w-6 shrink-0 rounded-full text-white"
            style={{ backgroundColor: CUSTOM_COLOR }}
          >
            <ExpenseCategoryIcon icon={CUSTOM_ICON} size={24} inset={0.18} />
          </span>
          <input
            autoFocus
            defaultValue=""
            disabled={isPending}
            placeholder={t("namePlaceholder")}
            className={`flex-1 ${inputClass}`}
            onBlur={(e) => handleBlur(e, saveNew)}
            onKeyDown={(e) => handleKeyDown(e, saveNew)}
          />
          <button
            type="button"
            onClick={cancel}
            disabled={isPending}
            aria-label={tc("cancel")}
            title={tc("cancel")}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-foreground/10 disabled:opacity-50"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditState({ kind: "adding" })}
          className="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed border-foreground/20 px-3 py-2 text-sm text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
        >
          <PlusIcon size={16} />
          {t("add")}
        </button>
      )}
    </div>
  );
}
