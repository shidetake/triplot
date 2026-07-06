"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  deleteTripAction,
  ensureInviteAction,
  regenerateInviteAction,
} from "@/app/trips/[tripId]/actions";
import { toast } from "@/components/toast";
import { confirmDialog } from "@/components/confirm-dialog";
import { buildExpensesCsv, type ExpenseCsvRow } from "@/lib/expenseCsv";
import { hexToKmlColor } from "@triplot/shared/placeColor";
import { getIconPath } from "@triplot/shared/placeIcons";
import {
  buildPlacesKml,
  type KmlPlacemark,
  type KmlStyle,
} from "@/lib/placeKml";
import { renderPinPng } from "@/lib/placePinImage";
import { buildZip, type ZipEntry } from "@/lib/zip";

import { Menu } from "@base-ui/react/menu";

import {
  CalendarExportDialog,
  type CalendarExportEvent,
} from "./calendar-export-dialog";
import { type Anchor, FormPopover } from "./form-popover";
import {
  CalendarDaysIcon,
  DownloadIcon,
  EditIcon,
  EllipsisIcon,
  MapIcon,
  ShareIcon,
  TagIcon,
  TrashIcon,
  UsersIcon,
  WalletIcon,
} from "./icons";
import { menuItemClass } from "./menu-item";
import { EditTripForm } from "./edit-trip-form";
import type { Currency } from "@triplot/shared/types/database";
import { Button } from "@/components/ui/button";

// ブラウザで生成したデータをファイルとしてダウンロードさせる。
function downloadBlob(
  filename: string,
  content: BlobPart,
  mime: string,
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 旅行のアクション群。Notion 同様、共有アイコン（単体）と ⋯ メニューの
// 両方から共有でき、⋯ メニューには削除やエクスポートも入れる。
export function TripActions({
  tripId,
  baseUrl,
  iAmAdmin,
  tripTitle,
  tripStartDate,
  tripEndDate,
  tripDefaultCurrency,
  kmlPlacemarks,
  expenseCsvRows,
  calendarEvents,
}: {
  tripId: string;
  baseUrl: string;
  iAmAdmin: boolean;
  tripTitle: string;
  // 編集フォームのプリフィル用（タイトル・日程・精算通貨）。
  tripStartDate: string | null;
  tripEndDate: string | null;
  tripDefaultCurrency: Currency;
  // 座標を持つ place のみ（KML エクスポート対象）。
  kmlPlacemarks: KmlPlacemark[];
  // 名前解決済みの費用行（CSV エクスポート対象）。
  expenseCsvRows: ExpenseCsvRow[];
  // Google カレンダー形式に変換可能な予定（自分に見えるもの）。mine フラグ付き。
  calendarEvents: CalendarExportEvent[];
}) {
  // ⋯ メニューの表示段階。export を選ぶとエクスポート先の選択に切り替わる
  // （ドリルイン式。Base UI Menu の closeOnClick=false で枠内ビューを切り替える）。
  const t = useTranslations("tripActions");
  const [menuView, setMenuView] = useState<"main" | "export">("main");
  const [shareAnchor, setShareAnchor] = useState<Anchor | null>(null);
  const [editAnchor, setEditAnchor] = useState<Anchor | null>(null);
  // カレンダーエクスポートのダイアログ表示位置（null で非表示）。
  const [calendarAnchor, setCalendarAnchor] = useState<Anchor | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  // 共有リンクは「ポップアップを開いた時点」で先に取得して state に持っておく。
  // こうすればコピーボタンのタップ時はネットワーク待ちが無く、navigator.clipboard を
  // 同期的に呼べる。iOS Safari は await（ネットワーク往復）を挟むと user activation が
  // 失効してクリップボード書き込みを拒否するため、これが必須。
  const fetchToken = () => {
    start(async () => {
      const res = await ensureInviteAction(tripId);
      if (res.error || !res.token) {
        toast(res.error ?? t("fetchFailed"));
        return;
      }
      setInviteToken(res.token);
    });
  };

  const openShare = (anchor: Anchor) => {
    setShareAnchor(anchor);
    if (!inviteToken) fetchToken();
  };

  const onCopy = async () => {
    if (!inviteToken) return;
    try {
      await navigator.clipboard.writeText(`${baseUrl}/join/${inviteToken}`);
      setShareAnchor(null);
      toast(t("copySuccess"));
    } catch {
      toast(t("copyFailed"));
    }
  };

  // 再生成は prefetch できない（開くたびに旧リンクを無効化してしまう）。新トークンは
  // ネットワーク往復後にしか存在しないので、コピーと分離する: 再生成は state を更新して
  // ポップアップは開いたまま、ユーザーが続けて「リンクをコピー」を押す（同期コピー）。
  const onRegenerate = async () => {
    const ok = await confirmDialog({
      title: t("regenerateTitle"),
      body: t("regenerateBody"),
      confirmLabel: t("regenerateConfirm"),
    });
    if (!ok) return;
    start(async () => {
      const res = await regenerateInviteAction(tripId);
      if (res.error || !res.token) {
        toast(res.error ?? t("regenerateFailed"));
        return;
      }
      setInviteToken(res.token);
      toast(t("regenerateSuccess"));
    });
  };

  // 次回開く時は main から始まるよう view をリセット（開閉自体は Base UI Menu 管理）。
  const closeMenu = () => setMenuView("main");

  // ファイル名に使えない文字を _ に。タイトルが空なら trip。
  const safeTitle = tripTitle.replace(/[\\/:*?"<>|]/g, "_").trim() || "trip";

  // 地図は KMZ（KML＋ピン画像の zip）で出す。色・アイコンを焼き込むので
  // Google Earth/QGIS では色付きピンで、マイマップでは色・カテゴリ列が活きる。
  const onExportMap = async () => {
    closeMenu();
    if (kmlPlacemarks.length === 0) {
      toast(t("noPlaces"));
      return;
    }
    try {
      // (アイコン × 色) の組み合わせごとに1スタイルを作る（dedupe）。
      // 「その他」の汎用ピン（iconKey="pin"）はグリフを描かず、地図既定の
      // マーカーに色だけ載せる（画像化しない）。それ以外は色付きピン画像を生成。
      const keyOf = (p: KmlPlacemark) =>
        `${p.iconKey ?? "pin"}|${p.colorHex ?? "none"}`;
      const isPlainPin = (iconKey: string) => iconKey === "pin";
      const styleByKey = new Map<
        string,
        { styleId: string; iconKey: string; colorHex: string | null }
      >();
      for (const p of kmlPlacemarks) {
        const k = keyOf(p);
        if (!styleByKey.has(k)) {
          styleByKey.set(k, {
            styleId: `s${styleByKey.size}`,
            iconKey: p.iconKey ?? "pin",
            colorHex: p.colorHex ?? null,
          });
        }
      }

      // 汎用ピン以外はピン画像を生成して KMZ に同梱。href も決める。
      const files: ZipEntry[] = [];
      const hrefByStyle = new Map<string, string>();
      for (const s of styleByKey.values()) {
        if (isPlainPin(s.iconKey)) continue; // 画像なし（既定マーカー＋色）
        const href = `files/${s.styleId}.png`;
        const png = await renderPinPng(getIconPath(s.iconKey), s.colorHex);
        files.push({ name: href, data: png });
        hrefByStyle.set(s.styleId, href);
      }

      // 各 placemark にスタイル ID を割り当て、styles を組む。
      const marks: KmlPlacemark[] = kmlPlacemarks.map((p) => ({
        ...p,
        styleId: styleByKey.get(keyOf(p))!.styleId,
      }));
      const styles: KmlStyle[] = [...styleByKey.values()].map((s) => ({
        id: s.styleId,
        color: hexToKmlColor(s.colorHex),
        iconHref: hrefByStyle.get(s.styleId), // 汎用ピンは undefined（<Icon> 無し）
      }));

      const kml = buildPlacesKml(tripTitle, marks, styles);
      const zip = buildZip([
        { name: "doc.kml", data: new TextEncoder().encode(kml) },
        ...files,
      ]);
      // Uint8Array<ArrayBufferLike> は BlobPart のジェネリックと噛み合わないので
      // ArrayBuffer 部分だけ取り出して渡す（zip は ArrayBuffer 裏付け）。
      downloadBlob(
        `${safeTitle}.kmz`,
        zip.buffer as ArrayBuffer,
        "application/vnd.google-earth.kmz",
      );
    } catch {
      toast(t("mapExportFailed"));
    }
  };

  const onExportExpenses = () => {
    closeMenu();
    if (expenseCsvRows.length === 0) {
      toast(t("noExpenses"));
      return;
    }
    const csv = buildExpensesCsv(expenseCsvRows);
    downloadBlob(`${safeTitle}-expenses.csv`, csv, "text/csv;charset=utf-8");
  };

  const onExportCalendar = (anchor: Anchor) => {
    closeMenu();
    if (calendarEvents.length === 0) {
      toast(t("noEvents"));
      return;
    }
    setCalendarAnchor(anchor);
  };

  const onDelete = async () => {
    setMenuView("main");
    const ok = await confirmDialog({
      title: t("deleteTripTitle"),
      body: t("deleteTripBody"),
    });
    if (!ok) return;
    start(async () => {
      const { error } = await deleteTripAction(tripId);
      if (error) toast(t("deleteTripFailed", { error }));
    });
  };

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("shareAria")}
          title={t("shareAria")}
          onClick={(e) => openShare({ x: e.clientX, y: e.clientY })}
        >
          <ShareIcon size={18} />
        </Button>
        <Menu.Root onOpenChange={(open) => { if (!open) setMenuView("main"); }}>
          <Menu.Trigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("menuAria")}
                title={t("menuAria")}
              >
                <EllipsisIcon size={18} />
              </Button>
            }
          />
          {/* ⋯ メニュー（共有 / メンバー / エクスポート / 削除）。
              エクスポートはドリルインで2段目（出力先）を出す。 */}
          <Menu.Portal>
            <Menu.Positioner align="end" sideOffset={8} className="z-50">
              <Menu.Popup className="w-56 overflow-hidden rounded-md border border-foreground/10 bg-background py-1 text-sm shadow-lg">
                {menuView === "main" ? (
                  <>
                    {iAmAdmin && (
                      <Menu.Item
                        onClick={(e) =>
                          setEditAnchor({ x: e.clientX, y: e.clientY })
                        }
                        className={`flex items-center gap-2 ${menuItemClass}`}
                      >
                        <EditIcon size={16} className="text-muted-foreground" />
                        {t("editTrip")}
                      </Menu.Item>
                    )}
                    <Menu.Item
                      render={<Link href={`/trips/${tripId}/members`} />}
                      className={`flex items-center gap-2 ${menuItemClass}`}
                    >
                      <UsersIcon size={16} className="text-muted-foreground" />
                      {t("manageMembers")}
                    </Menu.Item>
                    <Menu.Item
                      render={<Link href={`/trips/${tripId}/categories`} />}
                      className={`flex items-center gap-2 ${menuItemClass}`}
                    >
                      <TagIcon size={16} className="text-muted-foreground" />
                      {t("manageCategories")}
                    </Menu.Item>
                    <Menu.Item
                      onClick={(e) => openShare({ x: e.clientX, y: e.clientY })}
                      className={`flex items-center gap-2 ${menuItemClass}`}
                    >
                      <ShareIcon size={16} className="text-muted-foreground" />
                      {t("share")}
                    </Menu.Item>
                    <Menu.Item
                      closeOnClick={false}
                      onClick={() => setMenuView("export")}
                      className={`flex items-center gap-2 ${menuItemClass}`}
                    >
                      <DownloadIcon
                        size={16}
                        className="text-muted-foreground"
                      />
                      {t("export")}
                      <span
                        aria-hidden
                        className="ml-auto text-subtle-foreground"
                      >
                        ›
                      </span>
                    </Menu.Item>
                    {iAmAdmin && (
                      <Menu.Item
                        onClick={onDelete}
                        disabled={isPending}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-600/10 disabled:opacity-50"
                      >
                        <TrashIcon size={16} />
                        {t("deleteTrip")}
                      </Menu.Item>
                    )}
                  </>
                ) : (
                  <>
                    <Menu.Item
                      closeOnClick={false}
                      onClick={() => setMenuView("main")}
                      className={`flex items-center gap-1 text-muted-foreground ${menuItemClass}`}
                    >
                      <span aria-hidden>‹</span> {t("back")}
                    </Menu.Item>
                    <Menu.Item
                      onClick={(e) =>
                        onExportCalendar({ x: e.clientX, y: e.clientY })
                      }
                      className={`flex items-center gap-2 ${menuItemClass}`}
                    >
                      <CalendarDaysIcon
                        size={16}
                        className="text-muted-foreground"
                      />
                      {t("exportCalendar")}
                    </Menu.Item>
                    <Menu.Item
                      onClick={onExportMap}
                      className={`flex items-center gap-2 ${menuItemClass}`}
                    >
                      <MapIcon size={16} className="text-muted-foreground" />
                      {t("exportMap")}
                    </Menu.Item>
                    <Menu.Item
                      onClick={onExportExpenses}
                      className={`flex items-center gap-2 ${menuItemClass}`}
                    >
                      <WalletIcon size={16} className="text-muted-foreground" />
                      {t("exportExpenses")}
                    </Menu.Item>
                  </>
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {/* 旅行を編集（admin のみ。タイトル・日程・精算通貨） */}
      {editAnchor && (
        <FormPopover
          anchor={editAnchor}
          onClose={() => setEditAnchor(null)}
          label={t("editTrip")}
          fullScreenOnNarrow
        >
          <EditTripForm
            tripId={tripId}
            title={tripTitle}
            startDate={tripStartDate}
            endDate={tripEndDate}
            defaultCurrency={tripDefaultCurrency}
            hasExpenses={expenseCsvRows.length > 0}
            onDone={() => setEditAnchor(null)}
          />
        </FormPopover>
      )}

      {/* 共有ポップオーバー（アイコン・メニューどちらからも） */}
      {shareAnchor && (
        <FormPopover anchor={shareAnchor} onClose={() => setShareAnchor(null)} label={t("sharePopoverLabel")}>
          <div className="space-y-3 p-4">
            <p className="text-xs text-muted-foreground">
              {t("shareDesc")}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onCopy}
              disabled={isPending || !inviteToken}
              className="w-full"
            >
              {isPending ? t("copyPending") : t("copyLink")}
            </Button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isPending}
              className="block w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            >
              {t("regenerateLink")}
            </button>
          </div>
        </FormPopover>
      )}

      {/* カレンダーエクスポートのダイアログ（GIS ポップアップトークンフロー） */}
      {calendarAnchor && (
        <CalendarExportDialog
          anchor={calendarAnchor}
          onClose={() => setCalendarAnchor(null)}
          tripTitle={tripTitle}
          events={calendarEvents}
        />
      )}

    </>
  );
}
