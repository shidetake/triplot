"use client";

import { useCallback, useMemo, useState } from "react";

import { APIProvider } from "@vis.gl/react-google-maps";

import { centroid, type LatLng, TOKYO } from "@/lib/placeMap";

import { PlaceList, type PlaceRow, type PlaceStatus } from "./place-list";
import { PlaceMap, type Selection } from "./place-map";
import { CandidateInfo, DraftInfo, SavedInfo } from "./place-popups";
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
  // 地図タップで置いた仮ピン（未保存）。selected とは排他。
  const [draft, setDraft] = useState<LatLng | null>(null);
  // タップ選択中のベースマップ POI（マーカーは出さず吹き出しだけ）。
  const [poi, setPoi] = useState<CandidatePlace | null>(null);

  const biasCenter = useMemo(
    () =>
      centroid(
        places
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => ({ lat: p.lat as number, lng: p.lng as number })),
      ) ?? TOKYO,
    [places],
  );

  const onResults = useCallback((results: CandidatePlace[]) => {
    setCandidates(results);
    setSelected(null);
    setDraft(null);
    setPoi(null);
  }, []);

  const closeInfo = useCallback(() => {
    setSelected(null);
    setPoi(null);
  }, []);

  // 保存済み/候補を選んだら仮ピン・POI は引っ込める（同時に2つ開かない）。
  const selectSaved = useCallback((id: string) => {
    setDraft(null);
    setPoi(null);
    setSelected({ kind: "saved", id });
  }, []);
  const selectCandidate = useCallback((placeId: string) => {
    setDraft(null);
    setPoi(null);
    setSelected({ kind: "candidate", placeId });
  }, []);

  // 空白タップ: 何も開いてなければ仮ピンを置く/移動（モード無し）。
  const onMapTap = useCallback((p: LatLng) => {
    setSelected(null);
    setPoi(null);
    setDraft(p);
  }, []);
  const onDraftMove = useCallback((p: LatLng) => setDraft(p), []);
  const closeDraft = useCallback(() => setDraft(null), []);

  // 地図上の Google POI をタップ: 既存の POI アイコンはそのまま見せ、
  // マーカーは足さず吹き出し（CandidateInfo）だけ出す。
  const showPoi = useCallback((c: CandidatePlace) => {
    setDraft(null);
    setQuery("");
    setCandidates([]);
    setPoi(c);
    setSelected({ kind: "poi", placeId: c.placeId });
  }, []);

  // 場所を追加した時／× を押した時、どちらも「検索は用無し」なので
  // 検索文字列・候補ピン・選択中の吹き出し・仮ピン・POI をまとめて消す。
  const clearSearch = useCallback(() => {
    setQuery("");
    setCandidates([]);
    setSelected(null);
    setDraft(null);
    setPoi(null);
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
  if (selected?.kind === "candidate" || selected?.kind === "poi") {
    const c =
      selected.kind === "poi"
        ? poi
        : candidates.find((x) => x.placeId === selected.placeId);
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

  const draftContent: React.ReactNode = draft ? (
    <DraftInfo
      tripId={tripId}
      draft={draft}
      statuses={statuses}
      onAdded={clearSearch}
    />
  ) : null;

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
          draft={draft}
          poi={poi}
          onSelectSaved={selectSaved}
          onSelectCandidate={selectCandidate}
          onCloseInfo={closeInfo}
          onMapTap={onMapTap}
          onDraftMove={onDraftMove}
          onCloseDraft={closeDraft}
          onPoiSelect={showPoi}
          infoContent={infoContent}
          draftContent={draftContent}
        />
        <PlaceList
          places={places}
          statuses={statuses}
          selectedId={selected?.kind === "saved" ? selected.id : null}
          onSelect={selectSaved}
        />
      </div>
    </APIProvider>
  );
}
