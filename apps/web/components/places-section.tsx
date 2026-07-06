"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { APIProvider } from "@vis.gl/react-google-maps";
import { Drawer } from "vaul";

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
import { useMediaQuery } from "./use-media-query";
import { useActiveTripTab } from "@/lib/activeTripTab";
import {
  MOBILE_TAB_BOTTOM_OFFSET,
  MOBILE_TAB_TOP_OFFSET,
} from "@/lib/mobileTabChrome";

// タブバー化される狭い画面の判定（trip-detail-tabs.tsx の md ブレークポイントと同じ）。
const NARROW_SCREEN_QUERY = "(max-width: 767px)";

// 場所一覧ボトムシートの3つの高さ。
// - mini: ハンドル+件数の行だけがちょうど収まる高さ（48px）。地図を触った・
//   一覧の項目を選んだ・展開後に閉じた、など「もう見た」後はここまで畳む。
// - welcome: タブに入った直後だけの初期表示（96px）。ハンドル+件数の行の下に
//   一覧の先頭が少し覗く高さで、何があるか一目で分かる（mini と違い意図的に
//   覗かせている）。
// - expanded: viewport の 70%。上の検索欄がちょうど見える高さ止まり（0.75だと
//   検索欄まで覆ってしまうとのフィードバックで下げた。画面高に対する割合の
//   ため、iPhone mini等の低い画面では余白がさらに減る可能性がある）。
const MINI_SNAP = "48px";
const WELCOME_SNAP = "96px";
const EXPANDED_SNAP = 0.7;

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

  // 場所タブが今表示中か。4タブとも常時マウントされたまま CSS の hidden/block で
  // 出し分けているが、下のボトムシート(Drawer)は document.body に直接ポータルする
  // ため親の hidden では隠れない。他タブ表示中はこの isActive で明示的に畳む/外す。
  const isActive = useActiveTripTab() === "places";
  const isNarrow = useMediaQuery(NARROW_SCREEN_QUERY);
  const showPlacesSheet = isActive && isNarrow;

  const [query, setQuery] = useState("");
  // 狭い画面のみ: 場所リストを Vaul のドラッグ可能なボトムシートにする
  // （Google マップ風）。form-popover.tsx の NarrowSheet と同じ「viewport 基準
  // の fixed + 明示的 height」パターンに合わせる（container prop で地図パネルに
  // 閉じ込める案は snapPoints の内部計算と噛み合わず実機以前にレイアウトが
  // 壊れたため不採用。bottom オフセットでタブバーの上に固定する側で対応）。
  const [placesSheetSnap, setPlacesSheetSnap] = useState<
    number | string | null
  >(WELCOME_SNAP);
  // 地図を触った・一覧の項目を選んだ、など「もう見た」操作の後はここまで畳む。
  const collapsePlacesSheet = useCallback(() => {
    setPlacesSheetSnap(MINI_SNAP);
  }, []);

  // 他タブに移ったら welcome（初期表示の高さ）に戻しておく（React 公式の
  // 「props の変化に応じて state を調整する」パターン＝render中の直接setState。
  // useEffectでのcascading更新を避けるため、isActive の変化を前回値比較で
  // 検知する）。展開したまま他タブへ行ってまた場所タブに戻ると、いきなり
  // 展開済みで出てきて驚くため、非表示になった瞬間に戻しておく。再度この
  // タブに来た時にまた「何があるか一目で分かる」表示から始まってほしい。
  const [prevIsActive, setPrevIsActive] = useState(isActive);
  if (isActive !== prevIsActive) {
    setPrevIsActive(isActive);
    if (!isActive) setPlacesSheetSnap(WELCOME_SNAP);
  }

  // welcome は今まさにそこで静止している間だけ snapPoints に含める。ドラッグは
  // 常にその時点の snapPoints の中でしか止まれないため、mini↔expanded の
  // ドラッグ中は welcome を候補から外しておかないと、途中で一瞬引っかかって
  // 見える（ミニマムから開く時／マックスから閉じる時に welcome で止まらない
  // でほしい、というフィードバックへの対応）。welcome から一度でも離れたら
  // （タップ・ドラッグ・地図操作いずれでも）以降は mini/expanded の2点だけに
  // なり、次にこのタブへ入り直すまで welcome は候補に戻らない。
  const placesSheetSnapPoints = useMemo<(number | string)[]>(
    () =>
      placesSheetSnap === WELCOME_SNAP
        ? [MINI_SNAP, WELCOME_SNAP, EXPANDED_SNAP]
        : [MINI_SNAP, EXPANDED_SNAP],
    [placesSheetSnap],
  );

  // 背景スクロールの固定。Drawer.Root は modal=false（フォーム内のポータル等を
  // 生かす他の用途と合わせた設計）なので vaul 自身の scroll-lock には乗れない
  // （form-popover.tsx の NarrowSheet と同じ理由・同じ対処）。シート表示中だけ
  // ドキュメントの overflow を自前で固定し、ボディのドラッグが背景ページを
  // スクロールしてしまうのを防ぐ。
  useEffect(() => {
    if (!showPlacesSheet) return;
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = prev;
    };
  }, [showPlacesSheet]);
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
  // 一覧（ボトムシート）からのタップは地図を見る操作なので、シートも畳む。
  const selectSaved = useCallback(
    (id: string) => {
      setDraft(null);
      setPoi(null);
      setSelected({ kind: "saved", id });
      collapsePlacesSheet();
    },
    [collapsePlacesSheet],
  );
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
  // 他の選択状態は一旦クリアして、地図に集中させる（シートも畳む＝地図をタップする必要があるため）。
  const startLocate = useCallback(
    (id: string, name: string) => {
      setQuery("");
      setCandidates([]);
      setSelected(null);
      setDraft(null);
      setPoi(null);
      setPendingLocationFor({ id, name });
      collapsePlacesSheet();
    },
    [collapsePlacesSheet],
  );
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
          // 検索欄にフォーカスしたら一覧シートは邪魔なので mini まで畳む
          // （地図タップと同じ扱い）。React の focus イベントは合成 focusin
          // 相当でバブリングするため、この親要素の onFocus で子の input の
          // フォーカスも拾える。
          onFocus={collapsePlacesSheet}
        >
          {/* 入力欄・ボタンをそれぞれ自前の bg/border で浮かせる（Google マップ風）。
              周りを覆う不透明な枠は敷かない＝入力とボタンの間からも地図が見える
              ようにし、地図の表示領域を最大化する（前回 p-1 の枠を足す方向で
              直したが、逆に地図を隠す面積が増えるとフィードバックがあり撤回）。 */}
          <PlaceSearch
            query={query}
            onQueryChange={setQuery}
            onClear={clearSearch}
            biasCenter={biasCenter}
            onResults={onResults}
          />
        </div>

        <div
          className="fixed inset-x-0 md:static md:inset-auto"
          style={{ top: MOBILE_TAB_TOP_OFFSET, bottom: MOBILE_TAB_BOTTOM_OFFSET }}
          // 地図に触ったら一覧シートは邪魔なので mini まで畳む（タップ・ピン
          // ドラッグ開始・パン開始、いずれも pointerdown で拾える）。検索バーは
          // 別の兄弟要素なのでここには含まれない。
          onPointerDown={collapsePlacesSheet}
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

        {/* 場所一覧のボトムシート。狭い画面かつ場所タブが表示中の時だけ描画する
            （Drawer.Portal は document.body に直接ポータルするため、他タブ表示中に
            親の hidden/block だけでは隠せない。isActive で明示的に出し分ける）。
            form-popover.tsx の NarrowSheet と同じ viewport 基準の fixed+明示的height
            パターン。bottom を MOBILE_TAB_BOTTOM_OFFSET にしてタブバーの上に固定する
            （container prop で地図パネルに閉じ込める案は snapPoints の内部
            計算と噛み合わずレイアウトが壊れたため不採用）。 */}
        {showPlacesSheet && (
          <Drawer.Root
            open
            modal={false}
            dismissible={false}
            snapPoints={placesSheetSnapPoints}
            activeSnapPoint={placesSheetSnap}
            setActiveSnapPoint={setPlacesSheetSnap}
            scrollLockTimeout={0}
            repositionInputs={false}
          >
            <Drawer.Portal>
              <Drawer.Content
                aria-label={t("placesListLabel")}
                style={{ height: "100dvh", bottom: MOBILE_TAB_BOTTOM_OFFSET }}
                className="fixed inset-x-0 z-20 flex flex-col rounded-t-2xl border-t border-foreground/10 bg-background shadow-[0_-4px_16px_rgba(0,0,0,0.12)] outline-none md:hidden"
              >
                <Drawer.Title className="sr-only">
                  {t("placesListLabel")}
                </Drawer.Title>
                <button
                  type="button"
                  onClick={() =>
                    // 開いていた（expanded）ものを閉じる操作＝「一度開いて閉じた」
                    // なので mini まで畳む。閉じていれば expanded まで開く。
                    setPlacesSheetSnap(
                      placesSheetSnap === EXPANDED_SNAP
                        ? MINI_SNAP
                        : EXPANDED_SNAP,
                    )
                  }
                  className="flex shrink-0 cursor-grab flex-col items-center gap-1.5 pb-2 pt-2.5 active:cursor-grabbing"
                >
                  <Drawer.Handle className="!h-1.5 !w-9" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("placeCountLabel", { count: places.length })}
                  </span>
                </button>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
                  <PlaceList
                    places={places}
                    selectedId={
                      selected?.kind === "saved" ? selected.id : null
                    }
                    locatingId={pendingLocationFor?.id ?? null}
                    onSelect={selectSaved}
                    onLocate={startLocate}
                    onCancelLocate={cancelLocate}
                  />
                </div>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        )}

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
