"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";

import {
  deleteTripAction,
  ensureInviteAction,
  regenerateInviteAction,
} from "@/app/trips/[tripId]/actions";
import { toast } from "@/components/toast";
import { confirmDialog } from "@/components/confirm-dialog";
import { buildExpensesCsv, type ExpenseCsvRow } from "@triplot/shared/expenseCsv";
import { getIconPath } from "@triplot/shared/placeIcons";
import { buildPlacesKml, type KmlPlacemark } from "@triplot/shared/placeKml";
import { planKmz } from "@triplot/shared/placeKmz";
import { buildZip, type ZipEntry } from "@triplot/shared/zip";
import { renderPinPng } from "@/lib/placePinImage";

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

// 旅行のアクション群（編集・メンバー・カテゴリ・共有・エクスポート・削除）。
//
// ヘッダーを1本に統合したのに伴い、置き場所が2箇所に分かれた:
//   - 共有アイコン … ヘッダーに直接（iOS の旅行ナビバーと同じ位置づけ）
//   - それ以外     … アカウントメニューの中の「この旅行 ▸」サブメニュー
// どちらも同じ state（共有トークン・各ポップオーバーの開閉）を触るので、
// state と各ポップオーバーの実体は Provider が持ち、2つの見た目は context
// 経由でそれを呼ぶ。ポップオーバーの実体をメニューの中に置くと、メニューが
// 閉じた瞬間に一緒に unmount されて開けないため、必ず Provider 側に置く。
type TripActionsCtx = {
  tripId: string;
  iAmAdmin: boolean;
  isPending: boolean;
  menuView: "main" | "export";
  setMenuView: (v: "main" | "export") => void;
  openShare: (anchor: Anchor) => void;
  openEdit: (anchor: Anchor) => void;
  onExportMap: () => void;
  onExportExpenses: () => void;
  onExportCalendar: (anchor: Anchor) => void;
  onDelete: () => void;
};

const Ctx = createContext<TripActionsCtx | null>(null);

function useTripActions(): TripActionsCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("TripActionsProvider の外で使われています");
  return v;
}

export function TripActionsProvider({
  children,
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
  children: ReactNode;
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
      // (アイコン × 色) の畳み込みとスタイル ID の割り当ては shared
      // （RN のエクスポートと共用）。ここは needs のぶんだけ画像を作る。
      const { marks, styles, needs } = planKmz(kmlPlacemarks);
      const files: ZipEntry[] = [];
      for (const s of needs) {
        const png = await renderPinPng(getIconPath(s.iconKey), s.colorHex);
        files.push({ name: s.href, data: png });
      }

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
    <Ctx.Provider
      value={{
        tripId,
        iAmAdmin,
        isPending,
        menuView,
        setMenuView,
        openShare,
        openEdit: setEditAnchor,
        onExportMap,
        onExportExpenses,
        onExportCalendar,
        onDelete,
      }}
    >
      {children}

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
    </Ctx.Provider>
  );
}

// ヘッダーに直接置く共有アイコン。
export function TripShareButton() {
  const t = useTranslations("tripActions");
  const { openShare } = useTripActions();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t("shareAria")}
      title={t("shareAria")}
      className="rounded-full"
      onClick={(e) => openShare({ x: e.clientX, y: e.clientY })}
    >
      <ShareIcon size={20} />
    </Button>
  );
}

// アカウントメニューの中に差し込む「この旅行 ▸」サブメニュー。
// アカウント（自分）と旅行（対象）は別の意味なので、同じ一覧に混ぜず
// 1段階挟んで壁を作る（ui-guidelines「同じ目的には同じコントロール」）。
export function TripMenuSection() {
  const t = useTranslations("tripActions");
  const {
    tripId,
    iAmAdmin,
    isPending,
    menuView,
    setMenuView,
    openShare,
    openEdit,
    onExportMap,
    onExportExpenses,
    onExportCalendar,
    onDelete,
  } = useTripActions();
  return (
    <Menu.SubmenuRoot
      onOpenChange={(open) => {
        if (!open) setMenuView("main");
      }}
    >
      <Menu.SubmenuTrigger
        className={`flex items-center gap-2 ${menuItemClass}`}
      >
        <MapIcon size={16} className="text-muted-foreground" />
        {t("thisTrip")}
        <span aria-hidden className="ml-auto text-subtle-foreground">
          ›
        </span>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner align="start" sideOffset={4} className="z-50">
          <Menu.Popup className="w-56 overflow-hidden rounded-md border border-foreground/10 bg-background py-1 text-sm shadow-lg">
            {menuView === "main" ? (
              <>
                {iAmAdmin && (
                  <Menu.Item
                    onClick={(e) => openEdit({ x: e.clientX, y: e.clientY })}
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
                  <DownloadIcon size={16} className="text-muted-foreground" />
                  {t("export")}
                  <span aria-hidden className="ml-auto text-subtle-foreground">
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
    </Menu.SubmenuRoot>
  );
}
