"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { CategoryManagementList } from "./category-management-list";
import { EditTripForm } from "./edit-trip-form";
import { DownloadIcon, TagIcon, TrashIcon } from "./icons";
import { MembersManagementList } from "./members-management-list";
import { menuItemClass } from "./menu-item";
import { useTripActions } from "./trip-actions";

// 旅行の設定を1枚にまとめたシート（iOS の「旅行を編集」シートと同形）。
//
// 以前は ⋯ メニューに 旅行を編集 / メンバー管理 / 費用カテゴリ管理 / 共有 /
// エクスポート / 旅行を削除 の6項目が並列で並び、メンバーとカテゴリは別ページ
// だった。iOS は同じものを1枚のシートに畳んでいるので、そちらに揃える。
// カテゴリ管理とエクスポートだけは中身が大きいので、iOS と同じくドリルイン
// （この上にもう1枚重ねる）。
export function TripSettings() {
  const t = useTranslations();
  const {
    tripId,
    iAmAdmin,
    isPending,
    tripTitle,
    tripStartDate,
    tripEndDate,
    tripDefaultCurrency,
    hasExpenses,
    members,
    myMemberId,
    openShare,
    openCategories,
    openExport,
    onDelete,
    closeEdit,
  } = useTripActions();

  const rowClass = `flex w-full items-center gap-2 ${menuItemClass}`;

  return (
    // 幅とスクロールは器（FormPopover / NarrowSheet）が持つ。中身が幅を指定すると
    // ボトムシートの中で左寄せになり右に余白が残る（実機フィードバックで発覚）。
    <div>
      {/* 旅行名・日程・精算通貨（admin のみ編集可）。 */}
      <EditTripForm
        tripId={tripId}
        title={tripTitle}
        startDate={tripStartDate}
        endDate={tripEndDate}
        defaultCurrency={tripDefaultCurrency}
        hasExpenses={hasExpenses}
        onDone={closeEdit}
      />

      <section className="space-y-2 px-4 pb-4">
        <h3 className="text-sm font-semibold">{t("members.heading")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("members.editOwnName")}{" "}
          {iAmAdmin
            ? t("members.adminCanRemove")
            : t("members.onlyAdminCanRemove")}
        </p>
        <MembersManagementList
          tripId={tripId}
          members={members}
          myMemberId={myMemberId}
          iAmAdmin={iAmAdmin}
        />
      </section>

      <section className="space-y-2 px-4 pb-4">
        <h3 className="text-sm font-semibold">{t("tripActions.share")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("tripActions.shareDesc")}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={(e) => openShare({ x: e.clientX, y: e.clientY })}
          className="w-full"
        >
          {t("tripActions.shareLink")}
        </Button>
      </section>

      {/* 中身が大きいものはドリルイン（この上にもう1枚重ねる）。 */}
      <div className="border-t border-foreground/5 py-1">
        <button
          type="button"
          onClick={(e) => openCategories({ x: e.clientX, y: e.clientY })}
          className={rowClass}
        >
          <TagIcon size={16} className="text-muted-foreground" />
          {t("tripActions.manageCategories")}
          <span aria-hidden className="ml-auto text-subtle-foreground">
            ›
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => openExport({ x: e.clientX, y: e.clientY })}
          className={rowClass}
        >
          <DownloadIcon size={16} className="text-muted-foreground" />
          {t("tripActions.export")}
          <span aria-hidden className="ml-auto text-subtle-foreground">
            ›
          </span>
        </button>
      </div>

      {iAmAdmin && (
        <div className="border-t border-foreground/5 p-4">
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={onDelete}
            className="w-full"
          >
            <TrashIcon size={18} />
            {t("tripActions.deleteTrip")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ドリルイン先: 費用カテゴリ管理（旅行の設定の上に重ねる）。
export function TripCategoriesPanel() {
  const t = useTranslations("categories");
  const { tripId, categories } = useTripActions();
  return (
    <div className="p-4">
      <h2 className="mb-3 text-lg font-semibold">{t("heading")}</h2>
      <CategoryManagementList tripId={tripId} categories={categories} />
    </div>
  );
}
