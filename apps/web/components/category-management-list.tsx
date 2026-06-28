"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
const CUSTOM_COLOR = "#3b82f6";

export type CategoryItem = {
  id: string;
  name: string;
  color: string;
  icon: string;
  key: string | null;
};

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

  // 編集中: controlled input（TODO の edit input と同じパターン）
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  // 追加中: controlled input
  const [isAdding, setIsAdding] = useState(false);
  const [addValue, setAddValue] = useState("");

  // 追加行の input にスクロール → フォーカス（iOS autoFocus の誤スクロール回避）
  const addInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isAdding) return;
    const timer = setTimeout(() => {
      addInputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      addInputRef.current?.focus({ preventScroll: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [isAdding]);

  // 保存と削除は互いに影響しないよう separate transition
  const [isSavePending, startSaveTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();

  const catName = (c: CategoryItem) =>
    c.key ? tExp(`cat.${c.key}`) : c.name;

  const startEdit = (c: CategoryItem) => {
    setEditId(c.id);
    setEditValue(c.name);
  };

  // TODO の commitEdit と同じ構造: state から値を読む → setEditId(null) 先に → 非同期保存
  const commitEdit = (c: CategoryItem) => {
    if (editId !== c.id) return;
    const id = editId;
    const name = editValue.trim();
    setEditId(null);
    setEditValue("");
    if (!name || name === c.name) return;
    startSaveTransition(async () => {
      const res = await updateCategoryAction(id, tripId, name);
      if (res.error) toast(res.error);
      else toast(tc("saved"));
    });
  };

  const saveNew = () => {
    const name = addValue.trim();
    setIsAdding(false);
    setAddValue("");
    if (!name) return;
    startSaveTransition(async () => {
      const res = await createCategoryAction(tripId, name);
      if (res.error) toast(res.error);
    });
  };

  // confirmDialog は transition 外で呼ぶ（transition 内だと React がダイアログの
  // レンダリングを low-priority として遅延し、ダイアログが表示されない）
  const handleDelete = async (id: string) => {
    if (editId === id) { setEditId(null); setEditValue(""); }
    const ok = await confirmDialog({ title: t("deleteConfirmTitle") });
    if (!ok) return;
    startDeleteTransition(async () => {
      const res = await deleteCategoryAction(id, tripId);
      if (res.error) toast(res.error);
      else toast(t("deleteOk"));
    });
  };

  return (
    <div className="space-y-1">
      {categories.map((c) => {
        const isEditing = editId === c.id;
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
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                disabled={isSavePending}
                className={`flex-1 ${inputClass}`}
                onBlur={() => commitEdit(c)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter") { e.preventDefault(); commitEdit(c); }
                  if (e.key === "Escape") { e.preventDefault(); setEditId(null); setEditValue(""); }
                }}
              />
            ) : (
              <button
                type="button"
                disabled={!isCustom}
                onClick={() => isCustom && startEdit(c)}
                className={`flex-1 truncate rounded px-1 py-1.5 text-left text-sm transition ${
                  isCustom
                    ? "hover:bg-foreground/10"
                    : "cursor-default text-foreground"
                }`}
              >
                {catName(c)}
              </button>
            )}

            {/* ゴミ箱はカスタムカテゴリで常時表示（編集モード依存なし）
                → blur と click の競合・DOM 消滅レースがない */}
            {isCustom && (
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                disabled={isDeletePending}
                aria-label={tc("delete")}
                title={tc("delete")}
                className="shrink-0 rounded-md p-1.5 text-red-600 transition hover:bg-red-600/10 disabled:opacity-50"
              >
                <TrashIcon size={16} />
              </button>
            )}
          </div>
        );
      })}

      {/* 追加行: blur でも保存（iOS の Done ボタン = blur → 確定できる）
          autoFocus は使わず ref+useEffect でスクロール→フォーカスの順に制御（iOS scroll バグ回避） */}
      {isAdding ? (
        <div className="flex items-center gap-2">
          <span
            className="block h-6 w-6 shrink-0 rounded-full text-white"
            style={{ backgroundColor: CUSTOM_COLOR }}
          >
            <ExpenseCategoryIcon icon={CUSTOM_ICON} size={24} inset={0.18} />
          </span>
          <input
            ref={addInputRef}
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            disabled={isSavePending}
            placeholder={t("namePlaceholder")}
            className={`flex-1 ${inputClass}`}
            onBlur={saveNew}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter") { e.preventDefault(); saveNew(); }
              if (e.key === "Escape") { e.preventDefault(); setIsAdding(false); setAddValue(""); }
            }}
          />
          <button
            type="button"
            onClick={() => { setIsAdding(false); setAddValue(""); }}
            aria-label={tc("cancel")}
            title={tc("cancel")}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-foreground/10"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed border-foreground/20 px-3 py-2 text-sm text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
        >
          <PlusIcon size={16} />
          {t("add")}
        </button>
      )}
    </div>
  );
}
