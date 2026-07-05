"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { APIProvider } from "@vis.gl/react-google-maps";

import { centroid, type LatLng, TOKYO } from "@triplot/shared/placeMap";

import { PlaceList, type PlaceRow } from "./place-list";
// PlaceStatus は削除済み — place.tentative boolean に移行
import { PlaceMap, type Selection } from "./place-map";
import {
  CandidateInfo,
  DraftInfo,
  LocateInfo,
  type PinOption,
  SavedInfo,
} from "./place-popups";
import { type CandidatePlace, PlaceSearch } from "./place-search";
import { MessageBox } from "./message-box";
import { ChevronIcon } from "./icons";
import { cn } from "@/lib/utils";
import {
  MOBILE_TAB_BOTTOM_OFFSET,
  MOBILE_TAB_TOP_OFFSET,
} from "@/lib/mobileTabChrome";

export function PlacesSection({
  tripId,
  places,
  pinOptions,
  members,
  myMemberId,
}: {
  tripId: string;
  places: PlaceRow[];
  pinOptions: PinOption[];
  // 候補ピン（tentative）の色を作成者の hue で塗るのに使う。
  members: { id: string; color: number | null }[];
  myMemberId: string;
}) {
  const t = useTranslations("place");
  const locale = useLocale();
  const memberHueById = useMemo(
    () => new Map(members.map((m) => [m.id, m.color])),
    [members],
  );
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const [query, setQuery] = useState("");
  // 狭い画面のみ: 場所リストをボトムシート風パネルとしてタップで展開/折りたたむ
  // （ドラッグではなくタップ。Vaul の drag 物理演算は実機検証できないため今回は
  // 見送り、確実に動くタップ式にした）。
  const [listExpanded, setListExpanded] = useState(false);
  const [candidates, setCandidates] = useState<CandidatePlace[]>([]);
  const [selected, setSelected] = useState<Selection | null>(null);
  // 地図タップで置いた仮ピン（未保存）。selected とは排他。
  const [draft, setDraft] = useState<LatLng | null>(null);
  // タップ選択中のベースマップ POI（マーカーは出さず吹き出しだけ）。
  const [poi, setPoi] = useState<CandidatePlace | null>(null);
  // 「未マップ place の位置を地図で指定する」一回きりのスコープ状態。
  // 設定中は draft を置くと新規追加ではなくこの place の location を埋める。
  const [pendingLocationFor, setPendingLocationFor] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const biasCenter = useMemo(
    () =>
      centroid(
        places
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => ({ lat: p.lat as number, lng: p.lng as number })),
      ) ?? TOKYO,
    [places],
  );

  const onResults = useCallback(
    (results: CandidatePlace[], opts?: { selectFirst?: boolean }) => {
      setCandidates(results);
      setDraft(null);
      setPoi(null);
      // autocomplete からの 1 件確定なら、その候補を「選択中（吹き出し開く）」に。
      if (opts?.selectFirst && results[0]) {
        setSelected({ kind: "candidate", placeId: results[0].placeId });
      } else {
        setSelected(null);
      }
    },
    [],
  );

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

  // 未マップ place を一覧でクリック: 「位置を指定」スコープを開始する。
  // 他の選択状態は一旦クリアして、地図に集中させる。
  const startLocate = useCallback((id: string, name: string) => {
    setQuery("");
    setCandidates([]);
    setSelected(null);
    setDraft(null);
    setPoi(null);
    setPendingLocationFor({ id, name });
  }, []);
  const cancelLocate = useCallback(() => {
    setPendingLocationFor(null);
    setDraft(null);
  }, []);
  const finishLocate = useCallback(() => {
    setPendingLocationFor(null);
    setDraft(null);
  }, []);

  if (!apiKey) {
    return (
      <div className="space-y-4">
        <MessageBox kind="warning">
          {t("noApiKey")}
        </MessageBox>
        <PlaceList
          places={places}
          selectedId={null}
          locatingId={null}
          onSelect={() => {}}
          onLocate={() => {}}
          onCancelLocate={() => {}}
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
          pinOptions={pinOptions}
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
          pinOptions={pinOptions}
          canEdit={canEdit}
          canDelete={canEdit}
          canChangeVisibility={isCreator}
          onDone={closeInfo}
        />
      );
    }
  }

  const draftContent: React.ReactNode = !draft ? null : pendingLocationFor ? (
    // 「位置を指定」スコープ中の draft は既存 place への location 設定。
    <LocateInfo
      tripId={tripId}
      placeId={pendingLocationFor.id}
      placeName={pendingLocationFor.name}
      draft={draft}
      onDone={finishLocate}
      onCancel={cancelLocate}
    />
  ) : (
    <DraftInfo
      tripId={tripId}
      draft={draft}
      pinOptions={pinOptions}
      onAdded={clearSearch}
    />
  );

  return (
    <APIProvider apiKey={apiKey} language={locale}>
      {/* 狭い画面: 検索・地図・一覧パネルをそれぞれ直接 position:fixed で
          画面いっぱいに配置する（Google マップ風）。地図は h-full の多段継承
          （祖先の fixed → h-full section → relative → absolute inset-0 →
          h-full）だと実機で初期化タイミングと噛み合わず描画されない不具合が
          出たため、中間層を作らずこのコンポーネント自身が直接 fixed+top/bottom
          を持つ（lib/mobileTabChrome.ts の単一の真実）。広い画面(md:)は
          static に戻り「検索→地図→一覧」の通常縦積み。 */}
      <div className="md:space-y-4">
        {/* DOM順は広い画面の見た目順（検索→地図）に合わせる。狭い画面は
            z-10 で検索を地図の上に重ねるので順序に影響されない。 */}
        <div
          className="fixed inset-x-3 z-10 md:static md:inset-auto md:z-auto"
          style={{ top: `calc(${MOBILE_TAB_TOP_OFFSET} + 12px)` }}
        >
          <div className="rounded-md bg-background shadow-lg md:rounded-none md:bg-transparent md:shadow-none">
            <PlaceSearch
              query={query}
              onQueryChange={setQuery}
              onClear={clearSearch}
              biasCenter={biasCenter}
              onResults={onResults}
            />
          </div>
        </div>

        <div
          className="fixed inset-x-0 md:static md:inset-auto"
          style={{ top: MOBILE_TAB_TOP_OFFSET, bottom: MOBILE_TAB_BOTTOM_OFFSET }}
        >
          <PlaceMap
            places={places}
            memberHueById={memberHueById}
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
            className="h-full w-full rounded-none border-0 md:h-[32rem] md:rounded-md md:border md:border-foreground/10"
          />
        </div>

        <div
          className="fixed inset-x-0 z-10 md:hidden"
          style={{ bottom: MOBILE_TAB_BOTTOM_OFFSET }}
        >
          <button
            type="button"
            onClick={() => setListExpanded((v) => !v)}
            aria-expanded={listExpanded}
            className="flex w-full flex-col items-center gap-1.5 rounded-t-2xl border-t border-foreground/10 bg-background/95 pb-2 pt-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.12)] backdrop-blur"
          >
            <span className="h-1 w-9 rounded-full bg-foreground/20" aria-hidden />
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {t("placeCountLabel", { count: places.length })}
              <ChevronIcon
                size={12}
                className={cn(
                  "transition-transform",
                  listExpanded ? "rotate-90" : "-rotate-90",
                )}
              />
            </span>
          </button>
          <div
            className={cn(
              "overflow-y-auto bg-background transition-[max-height] duration-300 ease-out",
              listExpanded ? "max-h-[50vh]" : "max-h-0",
            )}
          >
            <div className="px-4 pb-4 pt-1">
              <PlaceList
                places={places}
                selectedId={selected?.kind === "saved" ? selected.id : null}
                locatingId={pendingLocationFor?.id ?? null}
                onSelect={selectSaved}
                onLocate={startLocate}
                onCancelLocate={cancelLocate}
              />
            </div>
          </div>
        </div>

        <div className="hidden md:block">
          <PlaceList
            places={places}
            selectedId={selected?.kind === "saved" ? selected.id : null}
            locatingId={pendingLocationFor?.id ?? null}
            onSelect={selectSaved}
            onLocate={startLocate}
            onCancelLocate={cancelLocate}
          />
        </div>
      </div>
    </APIProvider>
  );
}
