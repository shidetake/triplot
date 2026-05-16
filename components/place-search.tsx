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
  biasCenter,
  onResults,
}: {
  biasCenter: LatLng;
  onResults: (results: CandidatePlace[]) => void;
}) {
  const placesLib = useMapsLibrary("places");
  const [query, setQuery] = useState("");
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
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="店名・地名で検索（例: 浅草 寿司）"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
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
