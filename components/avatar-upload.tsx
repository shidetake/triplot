"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { EditIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

// アバターの変更。負債を避けるため:
//  - アップロード前にクライアントで 256px 正方形にリサイズ（数十KB・容量/転送ほぼゼロ）
//  - 固定パス uid/avatar に upsert で上書き（古い画像が溜まらない＝孤児ゼロ）
//  - 保存 URL に ?v=時刻 を付けてキャッシュ無効化（上書きしても新画像が出る）
//  - 削除時は Storage のファイルも消す
// users.avatar_url が設定済みなら Google の写真より優先表示。削除で Google（or 頭文字）へ。

const AVATAR_SIZE = 256;
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 入力ファイルの上限（リサイズ前）

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした。"));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}

// 中央を正方形にクロップして AVATAR_SIZE にリサイズ。webp 優先、不可なら jpeg。
async function resizeAvatar(
  file: File,
): Promise<{ blob: Blob; contentType: string }> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("この端末では画像変換ができません。");
  const scale = Math.max(AVATAR_SIZE / img.width, AVATAR_SIZE / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (AVATAR_SIZE - w) / 2, (AVATAR_SIZE - h) / 2, w, h);

  let blob = await toBlob(canvas, "image/webp");
  let contentType = "image/webp";
  if (!blob) {
    blob = await toBlob(canvas, "image/jpeg");
    contentType = "image/jpeg";
  }
  if (!blob) throw new Error("画像の変換に失敗しました。");
  return { blob, contentType };
}

export function AvatarUpload({
  userId,
  currentUrl,
  hasCustom,
  initial,
}: {
  userId: string;
  currentUrl: string | null; // 今表示中の実効アバター（カスタム or Google）
  hasCustom: boolean; // users.avatar_url が設定済みか
  initial: string; // 写真が無いときの頭文字
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 固定パス（拡張子なし）＝毎回ここに上書きするので孤児が出ない。
  const path = `${userId}/avatar`;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選んでください。");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError("ファイルが大きすぎます（10MB まで）。");
      return;
    }
    setBusy(true);
    try {
      const { blob, contentType } = await resizeAvatar(file);
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType, upsert: true });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      // 上書きしても新画像が出るようキャッシュ無効化のクエリを付けて保存。
      const url = `${publicUrl}?v=${Date.now()}`;
      const { error: updErr } = await supabase
        .from("users")
        .update({ avatar_url: url })
        .eq("id", userId);
      if (updErr) throw updErr;
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました。");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      await supabase.storage.from("avatars").remove([path]);
      const { error: updErr } = await supabase
        .from("users")
        .update({ avatar_url: null })
        .eq("id", userId);
      if (updErr) throw updErr;
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  function pickImage() {
    setOpen(false);
    fileRef.current?.click();
  }
  function revert() {
    setOpen(false);
    onRemove();
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={busy}
          aria-label="アバターを変更"
          title="アバターを変更"
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-xl font-medium text-white ring-1 ring-zinc-200 transition hover:opacity-90 disabled:opacity-50"
        >
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </button>
        {/* 右上の鉛筆マーク（編集できる感）。クリックはアバターボタンに通してメニューを開く。 */}
        <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-white">
          <EditIcon size={11} />
        </span>

        {open && (
          <div
            role="menu"
            className="absolute left-0 top-full z-20 mt-2 w-40 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={pickImage}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-50"
            >
              画像を選ぶ
            </button>
            {hasCustom && (
              <button
                type="button"
                role="menuitem"
                onClick={revert}
                className="block w-full px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-50"
              >
                デフォルトに戻す
              </button>
            )}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          disabled={busy}
          className="hidden"
        />
      </div>
      {busy && <p className="text-xs text-zinc-500">処理中…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
