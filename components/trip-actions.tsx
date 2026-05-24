"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  deleteTripAction,
  ensureInviteAction,
  regenerateInviteAction,
} from "@/app/trips/[tripId]/actions";

import { type Anchor, FormPopover } from "./form-popover";

// 旅行のアクション群。Notion 同様、共有アイコン（単体）と ⋯ メニューの
// 両方から共有でき、⋯ メニューには削除も入れる（中身は今後増やす想定）。
export function TripActions({
  tripId,
  baseUrl,
}: {
  tripId: string;
  baseUrl: string;
}) {
  const [menuAnchor, setMenuAnchor] = useState<Anchor | null>(null);
  const [shareAnchor, setShareAnchor] = useState<Anchor | null>(null);
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
      flashToast(
        "新しいリンクを発行しました（旧リンクは無効）。「リンクをコピー」を押してください",
      );
    });
  };

  const onDelete = () => {
    setMenuAnchor(null);
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
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M12 15V3" />
            <path d="m8 7 4-4 4 4" />
          </svg>
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

      {/* ⋯ メニュー（共有 / 削除） */}
      {menuAnchor && (
        <FormPopover anchor={menuAnchor} onClose={() => setMenuAnchor(null)}>
          <div className="py-1 text-sm">
            <button
              type="button"
              onClick={() => {
                const a = menuAnchor;
                setMenuAnchor(null);
                if (a) openShare(a);
              }}
              className="block w-full px-4 py-2 text-left transition hover:bg-zinc-100"
            >
              共有
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              className="block w-full px-4 py-2 text-left text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              この旅行を削除
            </button>
          </div>
        </FormPopover>
      )}

      {/* 共有ポップオーバー（アイコン・メニューどちらからも） */}
      {shareAnchor && (
        <FormPopover anchor={shareAnchor} onClose={() => setShareAnchor(null)}>
          <div className="space-y-3 p-4">
            <p className="text-xs text-zinc-500">
              リンクを知っている人はログイン不要（ゲスト）で参加できます。
            </p>
            <button
              type="button"
              onClick={onCopy}
              disabled={isPending || !inviteToken}
              className="h-9 w-full rounded-md bg-black text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
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

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
