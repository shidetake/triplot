"use client";

import { iconKeyForGoogleType } from "@triplot/shared/placeIcons";

import type { CandidatePlace } from "./place-search";
import { ChevronIcon } from "./icons";
import { PlaceIcon } from "./place-list";
import { PlaceRating } from "./place-rating";

// 検索結果の一覧（ボトムシートの中身）。iOS の検索結果シートと同じ形:
// 行の先頭グリフは地図の候補ピンと同じカテゴリアイコン（Google 赤）、
// その右に店名と「★評価 (件数) 住所」の1行。
export function CandidateList({
  candidates,
  selectedPlaceId,
  onSelect,
}: {
  candidates: CandidatePlace[];
  selectedPlaceId: string | null;
  onSelect: (placeId: string) => void;
}) {
  return (
    <ul className="divide-y divide-foreground/10 rounded-md border border-foreground/10 bg-background">
      {candidates.map((c) => {
        const isSelected = c.placeId === selectedPlaceId;
        return (
          <li key={c.placeId}>
            <button
              type="button"
              onClick={() => onSelect(c.placeId)}
              className={`flex w-full items-start gap-2 p-3 text-left text-sm transition ${
                isSelected ? "bg-accent" : "hover:bg-foreground/10"
              }`}
            >
              <PlaceIcon
                icon={iconKeyForGoogleType(c.primaryType)}
                size={20}
                className="mt-0.5 shrink-0"
                style={{ color: "#EA4335" }}
              />
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  {c.rating != null && (
                    <PlaceRating
                      rating={c.rating}
                      count={c.userRatingCount}
                      className="shrink-0"
                    />
                  )}
                  <span className="truncate">{c.address}</span>
                </span>
              </div>
              {/* プレビュー中（1タップ目）の行だけ、もう1タップで追加に進むことを
                  示す「＞」（保存済みの一覧と同じ）。 */}
              {isSelected && (
                <ChevronIcon
                  size={16}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
