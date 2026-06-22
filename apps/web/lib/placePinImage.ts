// place ピンを PNG 画像に描き起こす（クライアント専用 / canvas を使う）。
// KMZ にアイコン画像として同梱するため。triplot のピン＝色付きの雫型に
// 白いカテゴリグリフ（Material Symbols, viewBox "0 -960 960 960"）。
//
// 純粋ロジックではない（DOM/canvas 依存）のでユニットテストは置かない。
// 色は status.color（16進）をそのまま使い、UI のピン色と揃える。

import { GRAY_HEX } from "@triplot/shared/placeColor";

const W = 64;
const H = 80;
const CX = 32;
const CY = 30;
const R = 26;
const TIP_Y = 76;

// 雫型ピンのパスを ctx に積む（塗り/縁取りで2回使う）。
function pinPath(ctx: CanvasRenderingContext2D, grow: number) {
  const r = R + grow;
  ctx.beginPath();
  // 尾（三角）
  ctx.moveTo(CX - (14 + grow), CY + 16);
  ctx.lineTo(CX + (14 + grow), CY + 16);
  ctx.lineTo(CX, TIP_Y + grow);
  ctx.closePath();
  // 頭（円）
  ctx.moveTo(CX + r, CY);
  ctx.arc(CX, CY, r, 0, Math.PI * 2);
}

// グリフパス（白）＋ 色（16進）から PNG バイト列を生成。
export function renderPinPng(
  glyphPath: string,
  color: string | null,
): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas 2d context が取れません"));

  // 白い縁取り（Google マップのピン風に視認性を上げる）。
  ctx.fillStyle = "#ffffff";
  pinPath(ctx, 2);
  ctx.fill();

  // 本体色。
  ctx.fillStyle = color ?? GRAY_HEX;
  pinPath(ctx, 0);
  ctx.fill();

  // 白いグリフを頭の中央に。
  ctx.save();
  ctx.translate(CX, CY);
  const target = 30; // グリフの実寸（px）
  const sc = target / 960;
  ctx.scale(sc, sc);
  ctx.translate(-480, 480); // glyph 中心(480,-480) を原点へ
  ctx.fillStyle = "#ffffff";
  ctx.fill(new Path2D(glyphPath));
  ctx.restore();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG 生成に失敗しました"));
        return;
      }
      blob
        .arrayBuffer()
        .then((buf) => resolve(new Uint8Array(buf)))
        .catch(reject);
    }, "image/png");
  });
}
