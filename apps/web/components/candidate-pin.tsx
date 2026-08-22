"use client";

import {
  CANDIDATE_COLORS,
  CANDIDATE_PIN,
  candidatePinSize,
} from "@triplot/shared/placeMarker";

import { PlaceIcon } from "./place-list";

// 検索候補ピン（本家 Google マップの検索結果ピンと同形＝ピル＋丸のカテゴリ
// グリフ＋評価値＋下向きの尻尾）。寸法・配色は iOS と共通の
// @triplot/shared/placeMarker から取る（同じ見た目を2箇所で書かない）。
export function CandidatePin({
  icon,
  rating,
  selected,
  dark,
}: {
  icon: string;
  rating: number | null;
  selected: boolean;
  dark: boolean;
}) {
  const c = CANDIDATE_PIN;
  const col =
    CANDIDATE_COLORS[dark ? "dark" : "light"][selected ? "selected" : "normal"];
  const size = candidatePinSize(rating);
  return (
    <div
      className="flex flex-col items-center"
      style={{ width: size.width, height: size.height }}
    >
      <div
        className="flex items-center shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
        style={{
          height: c.pillHeight,
          borderRadius: c.pillHeight / 2,
          backgroundColor: col.pill,
          paddingLeft: c.pad,
          paddingRight: rating != null ? c.ratingPadRight : c.pad,
          gap: c.ratingGap,
        }}
      >
        <span
          className="flex items-center justify-center"
          style={{
            width: c.circle,
            height: c.circle,
            borderRadius: c.circle / 2,
            backgroundColor: col.circle,
            color: col.glyph,
          }}
        >
          <PlaceIcon icon={icon} size={c.glyph} />
        </span>
        {rating != null && (
          <span
            style={{
              fontSize: c.fontSize,
              fontWeight: 500,
              color: col.text,
              lineHeight: 1,
            }}
          >
            {rating.toFixed(1)}
          </span>
        )}
      </div>
      {/* 下向きの尻尾（ピルの底の中央から地図上の1点を指す）。 */}
      <svg
        width={c.tailWidth}
        height={c.tailHeight}
        viewBox="0 0 12 5"
        aria-hidden
      >
        <path d="M0 0h12L6 5Z" fill={col.pill} />
      </svg>
    </div>
  );
}
