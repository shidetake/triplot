"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { type Anchor, FormPopover } from "./form-popover";
import { CategoryForm, type CategoryFormValue } from "./category-form";
import { ExpenseCategoryIcon } from "./expense-category-icon";
import { Button } from "@/components/ui/button";
import { EditIcon, PlusIcon } from "./icons";

type Category = CategoryFormValue;

export function CategoryManagementList({
  tripId,
  categories,
}: {
  tripId: string;
  categories: Category[];
}) {
  const t = useTranslations("categories");
  const tExp = useTranslations("expense");

  const [popover, setPopover] = useState<{
    anchor: Anchor;
    category?: Category;
  } | null>(null);

  const openAdd = (e: React.MouseEvent) =>
    setPopover({ anchor: { x: e.clientX, y: e.clientY } });

  const openEdit = (e: React.MouseEvent, category: Category) =>
    setPopover({ anchor: { x: e.clientX, y: e.clientY }, category });

  const catName = (c: Category) =>
    c.key ? tExp(`cat.${c.key}`) : c.name;

  return (
    <>
      {categories.length > 0 && (
        <div className="divide-y divide-foreground/10 rounded-lg border border-foreground/10">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="block h-6 w-6 shrink-0 rounded-full text-white"
                style={{ backgroundColor: c.color }}
              >
                <ExpenseCategoryIcon icon={c.icon} size={24} inset={0.18} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {catName(c)}
              </span>
              {/* デフォルトカテゴリ(key != null)は編集不可 */}
              {c.key == null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  onClick={(e) => openEdit(e, c)}
                  aria-label={t("edit")}
                  title={t("edit")}
                >
                  <EditIcon size={16} />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={openAdd}
        className="mt-3 flex w-full items-center gap-2 rounded-md border border-dashed border-foreground/20 px-4 py-3 text-sm text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
      >
        <PlusIcon size={16} />
        {t("add")}
      </button>

      {popover && (
        <FormPopover
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          label={popover.category ? t("editHeading") : t("addHeading")}
          fullScreenOnNarrow
        >
          <CategoryForm
            tripId={tripId}
            category={popover.category}
            onDone={() => setPopover(null)}
          />
        </FormPopover>
      )}
    </>
  );
}
