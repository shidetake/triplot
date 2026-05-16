"use client";

import { useState } from "react";

import { useMapsLibrary } from "@vis.gl/react-google-maps";

import type { LatLng } from "@/lib/placeMap";

// 検索結果の候補（保存前）。searchByText 1 回のレスポンスをそのまま
// 吹き出しに再利用するので、ピンごとの追加 Places 呼び出しは発生しない。
export type CandidatePlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingCount: number | null;
  // 写真はここで URI まで作るが、課金は <img> が実際に読まれた時。
  // 吹き出しを開くまで <img> を描かないことで Photo 課金を抑える。
  photoUri: string | null;
};

// Enterprise ティア。これ以上のフィールド（営業時間/電話等）は要求しない。
const FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "photos",
];

export function PlaceSearch({
  query,
  onQueryChange,
  onClear,
  biasCenter,
  onResults,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onClear: () => void;
  biasCenter: LatLng;
  onResults: (results: CandidatePlace[]) => void;
}) {
  const placesLib = useMapsLibrary("places");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = !!placesLib;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!placesLib || !q || pending) return;

    setPending(true);
    setError(null);
    void (async () => {
      try {
        const { places } = await placesLib.Place.searchByText({
          textQuery: q,
          fields: FIELDS,
          language: "ja",
          region: "jp",
          maxResultCount: 20,
          // 既存ピンの重心（無ければ東京）周辺を優先。海外 trip でも文脈に沿う。
          locationBias: { center: biasCenter, radius: 30000 },
        });

        const results: CandidatePlace[] = (places ?? [])
          .filter((p) => p.id && p.location)
          .map((p) => ({
            placeId: p.id,
            name: p.displayName ?? "(名称不明)",
            address: p.formattedAddress ?? "",
            lat: p.location!.lat(),
            lng: p.location!.lng(),
            rating: p.rating ?? null,
            userRatingCount: p.userRatingCount ?? null,
            photoUri: p.photos?.[0]?.getURI({ maxWidth: 400 }) ?? null,
          }));

        onResults(results);
        if (results.length === 0) {
          setError("該当する場所が見つかりませんでした");
        }
      } catch {
        setError("検索に失敗しました。時間をおいて再度お試しください。");
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-1">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="店名・地名で検索（例: 浅草 寿司）"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-9 text-sm focus:border-black focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={onClear}
              aria-label="検索をクリア"
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!ready || pending}
          className="shrink-0 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? "検索中..." : "検索"}
        </button>
      </div>
      {!ready && (
        <p className="text-xs text-zinc-500">地図を読み込み中...</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
