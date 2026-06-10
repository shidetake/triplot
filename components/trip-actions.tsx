"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  deleteTripAction,
  ensureInviteAction,
  regenerateInviteAction,
} from "@/app/trips/[tripId]/actions";
import { buildExpensesCsv, type ExpenseCsvRow } from "@/lib/expenseCsv";
import { hexToKmlColor } from "@/lib/placeColor";
import { getIconPath } from "@/lib/placeIcons";
import {
  buildPlacesKml,
  type KmlPlacemark,
  type KmlStyle,
} from "@/lib/placeKml";
import { renderPinPng } from "@/lib/placePinImage";
import { buildZip, type ZipEntry } from "@/lib/zip";

import {
  CalendarExportDialog,
  type CalendarExportEvent,
} from "./calendar-export-dialog";
import { type Anchor, FormPopover } from "./form-popover";
import { ShareIcon } from "./icons";

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
  kmlPlacemarks,
  expenseCsvRows,
  calendarEvents,
}: {
  tripId: string;
  baseUrl: string;
  iAmAdmin: boolean;
  tripTitle: string;
  // 座標を持つ place のみ（KML エクスポート対象）。
  kmlPlacemarks: KmlPlacemark[];
  // 名前解決済みの費用行（CSV エクスポート対象）。
  expenseCsvRows: ExpenseCsvRow[];
  // Google カレンダー形式に変換可能な予定（自分に見えるもの）。mine フラグ付き。
  calendarEvents: CalendarExportEvent[];
}) {
  const [menuAnchor, setMenuAnchor] = useState<Anchor | null>(null);
  // ⋯ メニューの表示段階。export を選ぶとエクスポート先の選択に切り替わる。
  const [menuView, setMenuView] = useState<"main" | "export">("main");
  const [shareAnchor, setShareAnchor] = useState<Anchor | null>(null);
  // カレンダーエクスポートのダイアログ表示位置（null で非表示）。
  const [calendarAnchor, setCalendarAnchor] = useState<Anchor | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const flashToast = (msg: string) => {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2500);
  };

  // 共有リンクは「ポップアップを開いた時点」で先に取得して state に持っておく。
  // こうすればコピーボタンのタップ時はネットワーク待ちが無く、navigator.clipboard を
  // 同期的に呼べる。iOS Safari は await（ネットワーク往復）を挟むと user activation が
  // 失効してクリップボード書き込みを拒否するため、これが必須。
  const fetchToken = () => {
    start(async () => {
      const res = await ensureInviteAction(tripId);
      if (res.error || !res.token) {
        flashToast(res.error ?? "リンクの取得に失敗しました");
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
      flashToast("リンクをコピーしました");
    } catch {
      flashToast("コピーに失敗しました");
    }
  };

  // 再生成は prefetch できない（開くたびに旧リンクを無効化してしまう）。新トークンは
  // ネットワーク往復後にしか存在しないので、コピーと分離する: 再生成は state を更新して
  // ポップアップは開いたまま、ユーザーが続けて「リンクをコピー」を押す（同期コピー）。
  const onRegenerate = () => {
    if (
      !confirm(
        "リンクを再生成すると、今までのリンクは使えなくなります。よろしいですか？",
      )
    )
      return;
    start(async () => {
      const res = await regenerateInviteAction(tripId);
      if (res.error || !res.token) {
        flashToast(res.error ?? "再生成に失敗しました");
        return;
      }
      setInviteToken(res.token);
      flashToast("新しいリンクを発行しました。「リンクをコピー」を押してください");
    });
  };

  // ⋯ メニューを閉じる時は次回 main から始まるよう view もリセット。
  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuView("main");
  };

  // ファイル名に使えない文字を _ に。タイトルが空なら trip。
  const safeTitle = tripTitle.replace(/[\\/:*?"<>|]/g, "_").trim() || "trip";

  // 地図は KMZ（KML＋ピン画像の zip）で出す。色・アイコンを焼き込むので
  // Google Earth/QGIS では色付きピンで、マイマップでは色・カテゴリ列が活きる。
  const onExportMap = async () => {
    closeMenu();
    if (kmlPlacemarks.length === 0) {
      flashToast("地図に出せる場所がありません");
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
      flashToast("地図の書き出しに失敗しました");
    }
  };

  const onExportExpenses = () => {
    closeMenu();
    if (expenseCsvRows.length === 0) {
      flashToast("エクスポートする費用がありません");
      return;
    }
    const csv = buildExpensesCsv(expenseCsvRows);
    downloadBlob(`${safeTitle}-expenses.csv`, csv, "text/csv;charset=utf-8");
  };

  const onExportCalendar = (anchor: Anchor) => {
    closeMenu();
    if (calendarEvents.length === 0) {
      flashToast("エクスポートする予定がありません");
      return;
    }
    setCalendarAnchor(anchor);
  };

  const onDelete = () => {
    setMenuAnchor(null);
    setMenuView("main");
    if (
      !confirm(
        "この旅行を削除します。予定・場所・費用・メンバーもすべて消え、元に戻せません。よろしいですか？",
      )
    )
      return;
    start(async () => {
      const { error } = await deleteTripAction(tripId);
      if (error) alert(`削除に失敗しました: ${error}`);
    });
  };

  const iconBtn =
    "rounded-md p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900";

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          aria-label="共有"
          onClick={(e) => openShare({ x: e.clientX, y: e.clientY })}
          className={iconBtn}
        >
          <ShareIcon size={18} />
        </button>
        <button
          type="button"
          aria-label="メニュー"
          onClick={(e) => setMenuAnchor({ x: e.clientX, y: e.clientY })}
          className={iconBtn}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
          </svg>
        </button>
      </div>

      {/* ⋯ メニュー（共有 / メンバー / エクスポート / 削除）。
          エクスポートは2段目で出力先（地図 / 費用）を選ばせる。 */}
      {menuAnchor && (
        <FormPopover anchor={menuAnchor} onClose={closeMenu}>
          {menuView === "main" ? (
            <div className="py-1 text-sm">
              <button
                type="button"
                onClick={() => {
                  const a = menuAnchor;
                  closeMenu();
                  if (a) openShare(a);
                }}
                className="block w-full px-4 py-2 text-left transition hover:bg-zinc-100"
              >
                共有
              </button>
              <Link
                href={`/trips/${tripId}/members`}
                onClick={closeMenu}
                className="block w-full px-4 py-2 text-left transition hover:bg-zinc-100"
              >
                メンバー管理
              </Link>
              <button
                type="button"
                onClick={() => setMenuView("export")}
                className="flex w-full items-center justify-between px-4 py-2 text-left transition hover:bg-zinc-100"
              >
                エクスポート
                <span aria-hidden className="text-zinc-400">
                  ›
                </span>
              </button>
              {iAmAdmin && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isPending}
                  className="block w-full px-4 py-2 text-left text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  この旅行を削除
                </button>
              )}
            </div>
          ) : (
            <div className="py-1 text-sm">
              <button
                type="button"
                onClick={() => setMenuView("main")}
                className="flex w-full items-center gap-1 px-4 py-2 text-left text-zinc-500 transition hover:bg-zinc-100"
              >
                <span aria-hidden>‹</span> 戻る
              </button>
              <button
                type="button"
                onClick={(e) => onExportCalendar({ x: e.clientX, y: e.clientY })}
                className="block w-full px-4 py-2 text-left transition hover:bg-zinc-100"
              >
                予定（Google カレンダー）
              </button>
              <button
                type="button"
                onClick={onExportMap}
                className="block w-full px-4 py-2 text-left transition hover:bg-zinc-100"
              >
                地図（KMZ）
              </button>
              <button
                type="button"
                onClick={onExportExpenses}
                className="block w-full px-4 py-2 text-left transition hover:bg-zinc-100"
              >
                費用（CSV）
              </button>
            </div>
          )}
        </FormPopover>
      )}

      {/* 共有ポップオーバー（アイコン・メニューどちらからも） */}
      {shareAnchor && (
        <FormPopover anchor={shareAnchor} onClose={() => setShareAnchor(null)}>
          <div className="space-y-3 p-4">
            <p className="text-xs text-zinc-500">
              リンクがあればログイン不要で参加できます。
            </p>
            <button
              type="button"
              onClick={onCopy}
              disabled={isPending || !inviteToken}
              className="h-9 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "処理中..." : "リンクをコピー"}
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isPending}
              className="block w-full text-center text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline disabled:opacity-50"
            >
              リンクを再生成（旧リンクを無効化）
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

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
