import { useCallback, useRef } from "react";
import { View } from "react-native";
import Svg, { G, Path } from "react-native-svg";

import { getIconPath } from "@triplot/shared/placeIcons";
import { GRAY_HEX } from "@triplot/shared/placeColor";
import type { KmzStyleNeed } from "@triplot/shared/placeKmz";
import type { ZipEntry } from "@triplot/shared/zip";

// KMZ に同梱するピン画像を端末上で描き起こす（web の lib/placePinImage.ts の
// canvas 版と同じ絵）。RN に canvas は無いので、react-native-svg の
// toDataURL（ネイティブのビューをそのまま PNG に焼く）を使う＝新しい依存を
// 増やさない。画面には出さないので不透明度 0 の絶対配置に置く。
//
// 寸法・比率は web と同値（64×80 の雫型、白縁 2px、グリフ実寸 30px）。
const W = 64;
const H = 80;
const CX = 32;
const CY = 30;
const R = 26;
const TIP_Y = 76;
const GLYPH_TARGET = 30;

// 雫型（尾の三角＋頭の円）を1つの d にまとめる。grow は白縁のぶんの太らせ量。
function pinPathD(grow: number): string {
  const r = R + grow;
  const tail = `M ${CX - (14 + grow)},${CY + 16} L ${CX + (14 + grow)},${
    CY + 16
  } L ${CX},${TIP_Y + grow} Z`;
  // 円は2つの半円弧で描く（canvas の arc 相当）。
  const head = `M ${CX - r},${CY} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${
    -r * 2
  },0 Z`;
  return `${tail} ${head}`;
}

type Rendered = (styleId: string, base64: string) => void;

// 1つぶんのピン。ネイティブのビューが並んだ時点（onLayout）で PNG に焼く。
function PinSvg({
  need,
  onRendered,
}: {
  need: KmzStyleNeed;
  onRendered: Rendered;
}) {
  const ref = useRef<Svg>(null);
  const done = useRef(false);
  const capture = useCallback(() => {
    if (done.current) return;
    done.current = true;
    ref.current?.toDataURL((base64) => onRendered(need.styleId, base64));
  }, [need.styleId, onRendered]);

  const scale = GLYPH_TARGET / 960;
  return (
    <Svg
      ref={ref}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      onLayout={capture}
    >
      {/* 白い縁取り（Google マップのピン風に視認性を上げる） */}
      <Path d={pinPathD(2)} fill="#ffffff" />
      <Path d={pinPathD(0)} fill={need.colorHex ?? GRAY_HEX} />
      {/* 白いグリフを頭の中央に（Material Symbols は中心 480,-480） */}
      <G transform={`translate(${CX},${CY}) scale(${scale}) translate(-480,480)`}>
        <Path d={getIconPath(need.iconKey)} fill="#ffffff" />
      </G>
    </Svg>
  );
}

// needs のぶんだけピンを描き、全部焼き終わったら zip エントリとして返す。
// needs が空の時は呼び出し側が最初から使わない（何も描かない）。
export function PinPngRenderer({
  needs,
  onReady,
}: {
  needs: KmzStyleNeed[];
  onReady: (files: ZipEntry[]) => void;
}) {
  const collected = useRef(new Map<string, ZipEntry>());
  const finished = useRef(false);

  const onRendered = useCallback<Rendered>(
    (styleId, base64) => {
      const need = needs.find((n) => n.styleId === styleId);
      if (!need || finished.current) return;
      collected.current.set(styleId, {
        name: need.href,
        data: base64ToBytes(base64),
      });
      if (collected.current.size < needs.length) return;
      finished.current = true;
      onReady([...collected.current.values()]);
    },
    [needs, onReady],
  );

  return (
    <View style={{ position: "absolute", opacity: 0 }} pointerEvents="none">
      {needs.map((n) => (
        <PinSvg key={n.styleId} need={n} onRendered={onRendered} />
      ))}
    </View>
  );
}

// base64（toDataURL はプレフィックス無しの生 base64 を返す）→ バイト列。
function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
