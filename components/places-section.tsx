"use client";

import { useCallback, useMemo, useState } from "react";

import { APIProvider } from "@vis.gl/react-google-maps";

import { centroid, TOKYO } from "@/lib/placeMap";

import { PlaceList, type PlaceRow, type PlaceStatus } from "./place-list";
import { PlaceMap, type Selection } from "./place-map";
import { CandidateInfo, SavedInfo } from "./place-popups";
import { type CandidatePlace, PlaceSearch } from "./place-search";

export function PlacesSection({
  tripId,
  places,
  statuses,
  myMemberId,
}: {
  tripId: string;
  places: PlaceRow[];
  statuses: PlaceStatus[];
  myMemberId: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CandidatePlace[]>([]);
  const [selected, setSelected] = useState<Selection | null>(null);

  const biasCenter = useMemo(
    () => centroid(places.map((p) => ({ lat: p.lat, lng: p.lng }))) ?? TOKYO,
    [places],
  );

  const onResults = useCallback((results: CandidatePlace[]) => {
    setCandidates(results);
    setSelected(null);
  }, []);

  const closeInfo = useCallback(() => setSelected(null), []);

  // 場所を追加した時／× を押した時、どちらも「検索は用無し」なので
  // 検索文字列・候補ピン・選択中の吹き出しをまとめて消す。
  const clearSearch = useCallback(() => {
    setQuery("");
    setCandidates([]);
    setSelected(null);
  }, []);

  if (!apiKey) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Google Maps API キーが未設定のため、地図と場所検索は無効です（一覧のみ表示）。
        </p>
        <PlaceList
          places={places}
          statuses={statuses}
          selectedId={null}
          onSelect={() => {}}
        />
      </div>
    );
  }

  let infoContent: React.ReactNode = null;
  if (selected?.kind === "candidate") {
    const c = candidates.find((x) => x.placeId === selected.placeId);
    if (c) {
      infoContent = (
        <CandidateInfo
          tripId={tripId}
          candidate={c}
          statuses={statuses}
          onAdded={clearSearch}
        />
      );
    }
  } else if (selected?.kind === "saved") {
    const p = places.find((x) => x.id === selected.id);
    if (p) {
      const isCreator = p.created_by_member_id === myMemberId;
      const canEdit = p.visibility === "private" ? isCreator : true;
      infoContent = (
        <SavedInfo
          tripId={tripId}
          place={p}
          statuses={statuses}
          canEdit={canEdit}
          canDelete={canEdit}
          canChangeVisibility={isCreator}
          onDone={closeInfo}
        />
      );
    }
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div className="space-y-4">
        <PlaceSearch
          query={query}
          onQueryChange={setQuery}
          onClear={clearSearch}
          biasCenter={biasCenter}
          onResults={onResults}
        />
        <PlaceMap
          places={places}
          statuses={statuses}
          candidates={candidates}
          selected={selected}
          onSelectSaved={(id) => setSelected({ kind: "saved", id })}
          onSelectCandidate={(placeId) =>
            setSelected({ kind: "candidate", placeId })
          }
          onCloseInfo={closeInfo}
          infoContent={infoContent}
        />
        <PlaceList
          places={places}
          statuses={statuses}
          selectedId={selected?.kind === "saved" ? selected.id : null}
          onSelect={(id) => setSelected({ kind: "saved", id })}
        />
      </div>
    </APIProvider>
  );
}
