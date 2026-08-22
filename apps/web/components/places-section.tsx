"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { APIProvider } from "@vis.gl/react-google-maps";
import { Drawer } from "vaul";

import {
  dominantCenter,
  labelByPlace,
  type LatLng,
  TOKYO,
} from "@triplot/shared/placeMap";
import {
  areaFilterOptions,
  dayFilterOptions,
  matchesPlaceFilter,
  type PlaceFilter,
} from "@triplot/shared/placeFilter";
import type { VisitDay } from "@triplot/shared/placeOrder";

import { confirmDialog } from "./confirm-dialog";
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
import { MAP_OVERLAY_BOTTOM_PX } from "./map-controls";
import { CandidateList } from "./candidate-list";
import { CloseButton } from "./close-button";
import { PlaceFilterMenu } from "./place-filter-menu";
import { type CandidatePlace, PlaceSearch } from "./place-search";
import { MessageBox } from "./message-box";
import { toast } from "./toast";
import { useMediaQuery } from "./use-media-query";
import { useMobileChromeMargins } from "./use-mobile-chrome-margins";
import { useActiveTripTab } from "@/lib/activeTripTab";
import {
  dismissPlaceLocationAction,
  resolvePlaceToGoogleAction,
} from "@/app/trips/[tripId]/actions";
import { ChevronIcon } from "./icons";
import { fitAndHalfDetents } from "@triplot/shared/sheetDetents";
import {
  MOBILE_TAB_BOTTOM_OFFSET,
  MOBILE_TAB_TOP_OFFSET,
  NARROW_SCREEN_QUERY,
} from "@/lib/mobileTabChrome";

// 一覧シートの段（detent）。計算は shared の fitAndHalfDetents（iOS と共通）。
// 「中身にフィット（上限＝検索欄の下まで）」＋「画面の半分」の2段で、開いた
// 瞬間は大きい方から。
//
// 検索欄の行の高さ(h-9=36px) + 検索バーの上マージン(12px) + 検索欄の下の余白。
// 下の余白は上マージンと同じ 12px（検索欄の上に見えている地図の帯と同じだけ
// 下にも見せる）。PlaceSearch の見た目を変えたらここも見直す。
const SEARCH_ROW_EXTRA_PX = 36 + 12 + 12;
// 小さい段を足す下限。これを下回るなら1段のまま（取っ手だけのシートを作らない）。
// 見出し帯 + 1行ぶん。
const SHEET_MIN_HALF_PX = 44 + 56;

export function PlacesSection({
  tripId,
  places,
  pinOptions,
  visitDayEntries,
  earliestVisitEntries,
  members,
  myMemberId,
}: {
  tripId: string;
  places: PlaceRow[];
  pinOptions: PinOption[];
  // 絞り込み用の派生（Map は RSC 境界を越えられないのでエントリ配列で受ける）。
  visitDayEntries: [string, VisitDay][];
  earliestVisitEntries: [string, number][];
  // 候補ピン（tentative）の色を作成者の hue で塗るのに使う。
  members: { id: string; color: number | null }[];
  myMemberId: string;
}) {
  const t = useTranslations("place");
  const tCommon = useTranslations("common");
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

  // シートの段（detent）は iOS と同じ計算に載せる（@triplot/shared/sheetDetents）。
  // 「中身にフィット（上限＝検索欄の下まで）」＋「画面の半分」の2段で、開いた
  // 瞬間は大きい方から。以前は 48px/96px の帯を常時覗かせる形だったが、
  // それだとタブバーの上に浮かせるための bottom オフセットが要り、vaul の
  // px snapPoint（viewport 下端起点）と二重に効く問題を抱えていた。浮島
  // ボタンから開く形にして bottom:0 に戻したので、その問題ごと無くなった。
  const { top: chromeTopPx, viewportHeight } = useMobileChromeMargins();
  const [placesSheetOpen, setPlacesSheetOpen] = useState(false);
  // 中身の実測高（一覧の中身＋見出し帯）。届くまでは概算で組む。
  const [listContentH, setListContentH] = useState(0);
  // 取っ手＋件数の帯の高さ（一覧に使える高さを出すのに引く）。中身が変わらない
  // ので1回測れば足りる。
  const [listChromeH, setListChromeH] = useState(0);
  const listChromeRef = useCallback((el: HTMLDivElement | null) => {
    if (el) setListChromeH(el.offsetHeight);
  }, []);
  const listMeasureRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => setListContentH(el.scrollHeight));
    ro.observe(el);
    setListContentH(el.scrollHeight);
    return () => ro.disconnect();
  }, []);

  const [query, setQuery] = useState("");
  // 狭い画面のみ: 場所リストを Vaul のドラッグ可能なボトムシートにする
  // （Google マップ風）。**閉じている間は出さず、地図の上の浮島ボタンから開く**
  // （iOS と同形。以前は常に帯を覗かせていた）。bottom:0 に置けるので、他の
  // シート（NarrowSheet）と同じ「viewport 基準の fixed + 明示的 height」に
  // そのまま乗る。
  //
  // 段は shared の fitAndHalfDetents（iOS と同じ計算）。「今どの段か」は px
  // 文字列そのものではなく意味（half/fit）で持つ: 実測や resize で px の値が
  // 変わった瞬間に activeSnapPoint が snapPoints のどれとも一致しなくなり、
  // vaul の位置計算が壊れるため（実機で「展開時の上限がずれる」不具合として発覚）。
  const sheetCapPx = Math.max(
    0,
    viewportHeight - chromeTopPx - SEARCH_ROW_EXTRA_PX,
  );
  const { detents: placesDetents } = useMemo(
    () =>
      fitAndHalfDetents({
        contentHeight: listContentH || sheetCapPx,
        capHeight: sheetCapPx,
        referenceHeight: Math.max(1, viewportHeight - chromeTopPx),
        minHalfHeight: SHEET_MIN_HALF_PX,
      }),
    [listContentH, sheetCapPx, viewportHeight, chromeTopPx],
  );
  // 検索結果は件数が多くなりがちなので、iOS と同じく画面の 1/4・1/2 の2段で
  // 地図と一覧を同時に見せる（本家 Google マップの検索結果シートと同じ）。
  const searchDetents = [0.25, 0.5];
  const inSearch = query.trim().length > 0;
  const refPx = Math.max(1, viewportHeight - chromeTopPx);
  const [snapIndex, setSnapIndex] = useState<"small" | "large">("large");
  // 地図を触った・一覧の項目を選んだ、など「もう見た」操作の後は閉じる
  // （以前は mini まで畳んでいたが、閉じている間は浮島ボタンが出るので同じ意味）。
  const collapsePlacesSheet = useCallback(() => {
    setPlacesSheetOpen(false);
  }, []);

  // 他タブに移ったら閉じておく（React 公式の「props の変化に応じて state を
  // 調整する」パターン＝render 中の直接 setState）。展開したまま他タブへ行って
  // また戻ると、いきなり開いた状態で出てきて驚くため。
  const [prevIsActive, setPrevIsActive] = useState(isActive);
  if (isActive !== prevIsActive) {
    setPrevIsActive(isActive);
    if (!isActive) setPlacesSheetOpen(false);
  }

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
  // 検索結果が出ている間は、一覧シートの中身を候補（検索結果）に差し替える
  // （iOS の listMode = "search" と同じ）。
  const inCandidates = candidates.length > 0;
  // 「地図未登録」を破棄した場所は既定で一覧・地図から隠す（メールのスパム
  // フォルダと同じ考え方: 通常は出さないが、意図的にオンにすれば奥から出せる）。
  const [showDismissed, setShowDismissed] = useState(false);
  // 地図のピンと一覧の両方を絞り込む（エリア or 日にちのどちらか一方）。
  // null＝絞り込みなし。iOS の場所タブと同じ選択肢・同じ規則。
  const [placeFilter, setPlaceFilter] = useState<PlaceFilter | null>(null);

  const dayByPlaceId = useMemo(
    () => new Map(visitDayEntries),
    [visitDayEntries],
  );
  const earliestMsByPlaceId = useMemo(
    () => new Map(earliestVisitEntries),
    [earliestVisitEntries],
  );
  // エリアは地図のクラスタリングと同じ規則でラベル付けする。
  const areaByPlaceId = useMemo(
    () =>
      labelByPlace(
        places
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => ({
            id: p.id,
            lat: p.lat as number,
            lng: p.lng as number,
            region: p.region,
            locality: p.locality,
          })),
      ),
    [places],
  );
  // 選択肢は常に全件から出す＝絞り込み中でも他の選択肢が消えず切り替えられる。
  const areaOptions = useMemo(
    () => areaFilterOptions(areaByPlaceId, earliestMsByPlaceId),
    [areaByPlaceId, earliestMsByPlaceId],
  );
  const dayOptions = useMemo(
    () => dayFilterOptions(dayByPlaceId),
    [dayByPlaceId],
  );

  const visiblePlaces = useMemo(() => {
    const base = placeFilter
      ? places.filter((p) =>
          matchesPlaceFilter(p.id, placeFilter, areaByPlaceId, dayByPlaceId),
        )
      : places;
    return showDismissed
      ? base
      : base.filter((p) => !(p.lat == null && p.location_dismissed));
  }, [places, placeFilter, areaByPlaceId, dayByPlaceId, showDismissed]);
  const dismissedCount = useMemo(
    () => places.filter((p) => p.lat == null && p.location_dismissed).length,
    [places],
  );
  const [selected, setSelected] = useState<Selection | null>(null);

  // 行を選択している間は小さい段までに制限する（一覧より地図が主役という方針。
  // iOS と同じ）。検索中は iOS と同じ [0.25, 0.5]。
  const activeDetents = inSearch
    ? searchDetents
    : selected?.kind === "saved"
      ? [placesDetents[0]]
      : placesDetents;
  const snapPoints = activeDetents.map((d) => `${Math.round(d * refPx)}px`);
  const activeSnap =
    snapPoints[snapIndex === "small" ? 0 : snapPoints.length - 1] ??
    snapPoints[0];
  // 今の段でシートが画面に見せている高さ（px）。snapPoints は viewport 下端
  // からのオフセット px なので、その値がそのまま見えている高さになる。
  const activeSnapPx = Number.parseInt(activeSnap ?? "0", 10) || 0;
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
      dominantCenter(
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
      // 検索したら結果の一覧をシートで出す（iOS と同じ）。段は searchDetents の
      // 大きい方（画面の半分）＝地図と一覧を同時に見せる本家 Google マップの
      // 検索結果シートと同じ見せ方。
      if (results.length > 0) {
        setSnapIndex("large");
        setPlacesSheetOpen(true);
      }
      // autocomplete からの 1 件確定なら、その候補を「選択中（吹き出し開く）」に。
      if (opts?.selectFirst && results[0]) {
        setSelected({ kind: "candidate", placeId: results[0].placeId });
      } else {
        setSelected(null);
      }
    },
    [],
  );

  // 保存済みの場所は「1タップ目＝一覧の中で選択、2タップ目＝詳細を開く」
  // （iOS と同じ）。選択しただけの状態と、詳細シートを開いた状態を分けて持つ。
  const [savedInfoOpen, setSavedInfoOpen] = useState(false);

  // 地図の何もない所のタップ＝一段戻る（iOS の「段階的に一段戻す」と同じ）。
  // **選択そのものを解く**ので一覧の選択表示も元に戻り、詳細を開いていれば
  // 一緒に閉じる。シートを下まで引いて閉じ切った時も同じ後始末をする。
  const dismissSelection = useCallback(() => {
    setSavedInfoOpen(false);
    setSelected(null);
    setPoi(null);
  }, []);

  const closeInfo = useCallback(() => {
    // 詳細を閉じても選択は残す＝一覧のその行が選択されたまま戻る（iOS と同じ）。
    // 候補・POI は選択そのものが詳細と一体なので選択ごと解除する。
    setSelected((cur) => {
      if (cur?.kind === "saved") {
        setSavedInfoOpen(false);
        return cur;
      }
      setPoi(null);
      return null;
    });
  }, []);

  // 「位置を指定」モード中に、既存の登録済み場所・POI・検索結果を選んだ時の
  // 共通処理: 未確定の場所をタップ/検索で選んだ実在の Google の場所へ寄せる
  // （新しいピンを作るのではなく、既にある場所を優先する）。店名が自由入力と
  // 大きく変わっても、ユーザーが地図上/検索で明示的に選んだ場所を採用する
  // （予定/費用は place_id で参照しているので自動的に追従する。既に旅行に
  // 登録済みの場所を選んだ場合は resolve_place_to_google 側でマージされる）。
  // 戻り値 true なら呼び出し元は通常の遷移（プレビュー/追加フォームを開く等）
  // をスキップする。
  const resolveLocatingTo = useCallback(
    (target: {
      googlePlaceId: string;
      name: string;
      lat: number;
      lng: number;
      formattedAddress: string | null;
      region: string | null;
      locality: string | null;
      icon: string | null;
    }): boolean => {
      if (!pendingLocationFor) return false;
      const placeId = pendingLocationFor.id;
      const fromName = pendingLocationFor.name;
      void (async () => {
        const ok = await confirmDialog({
          title: t("resolveToTitle", { to: target.name }),
          body: fromName,
          confirmLabel: tCommon("confirm"),
          destructive: false,
        });
        if (!ok) return;
        const { error } = await resolvePlaceToGoogleAction(tripId, placeId, {
          googlePlaceId: target.googlePlaceId,
          name: target.name,
          lat: target.lat,
          lng: target.lng,
          formattedAddress: target.formattedAddress ?? "",
          icon: target.icon,
          region: target.region,
          locality: target.locality,
        });
        if (error) {
          toast(error);
          return;
        }
        setPendingLocationFor(null);
        setDraft(null);
      })();
      return true;
    },
    [pendingLocationFor, tripId, t, tCommon],
  );

  // 保存済み/候補を選んだら仮ピン・POI は引っ込める（同時に2つ開かない）。
  // 一覧（ボトムシート）からのタップは地図を見る操作なので、シートも畳む。
  // 「位置を指定」モード中は、既存の場所を選んでもそのピンを新規に開かず、
  // その場所へ未確定の場所を寄せる（resolveLocatingTo 参照）。
  const selectSaved = useCallback(
    (id: string) => {
      const saved = places.find((p) => p.id === id);
      if (
        pendingLocationFor &&
        saved?.google_place_id &&
        saved.lat != null &&
        saved.lng != null &&
        resolveLocatingTo({
          googlePlaceId: saved.google_place_id,
          name: saved.name,
          lat: saved.lat,
          lng: saved.lng,
          formattedAddress: saved.formatted_address,
          region: saved.region,
          locality: saved.locality,
          icon: saved.icon,
        })
      ) {
        return;
      }
      setDraft(null);
      setPoi(null);
      setSelected((cur) => {
        // 既に選んでいる場所をもう一度タップ＝詳細（編集）へ進む。
        if (cur?.kind === "saved" && cur.id === id) {
          setSavedInfoOpen(true);
          return cur;
        }
        // 1タップ目は選択だけ。詳細シートは出さず、一覧の中でその行が
        // 開いた状態にする（iOS の「プレビュー」と同じ）。一覧が閉じて
        // いれば開く＝どこから選んでも選択の見え方が同じになる。
        setSavedInfoOpen(false);
        setSnapIndex("small");
        setPlacesSheetOpen(true);
        return { kind: "saved", id };
      });
    },
    [places, pendingLocationFor, resolveLocatingTo],
  );
  // この Google place が旅行に登録済みなら、その保存済みの場所を返す
  // （同じ店を POI タップ・検索・候補ピンから何度でも追加できてしまい、
  // 重複登録される報告への対策。同じ場所なら追加ではなく既存を開く。iOS と同じ）。
  const findSavedByGoogleId = useCallback(
    (googlePlaceId: string) =>
      places.find((p) => p.google_place_id === googlePlaceId) ?? null,
    [places],
  );

  const selectCandidate = useCallback(
    (placeId: string) => {
      const saved = findSavedByGoogleId(placeId);
      if (saved) {
        selectSaved(saved.id);
        return;
      }
      const c = candidates.find((x) => x.placeId === placeId);
      if (
        c &&
        resolveLocatingTo({
          googlePlaceId: c.placeId,
          name: c.name,
          lat: c.lat,
          lng: c.lng,
          formattedAddress: c.address,
          region: c.region,
          locality: c.locality,
          icon: null,
        })
      ) {
        return;
      }
      setDraft(null);
      setPoi(null);
      setSelected({ kind: "candidate", placeId });
    },
    [findSavedByGoogleId, selectSaved, candidates, resolveLocatingTo],
  );

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
  const showPoi = useCallback(
    (c: CandidatePlace) => {
      if (
        resolveLocatingTo({
          googlePlaceId: c.placeId,
          name: c.name,
          lat: c.lat,
          lng: c.lng,
          formattedAddress: c.address,
          region: c.region,
          locality: c.locality,
          icon: null,
        })
      ) {
        return;
      }
      setDraft(null);
      setQuery("");
      setCandidates([]);
      setPoi(c);
      setSelected({ kind: "poi", placeId: c.placeId });
    },
    [resolveLocatingTo],
  );

  // 場所を追加した時／× を押した時、どちらも「検索は用無し」なので
  // 検索文字列・候補ピン・選択中の吹き出し・仮ピン・POI をまとめて消す。
  const clearSearch = useCallback(() => {
    setQuery("");
    setCandidates([]);
    setSelected(null);
    setDraft(null);
    setPoi(null);
  }, []);

  // autocomplete で確定した Google place が登録済みなら、検索を畳んで
  // 既存の場所（吹き出し）を開く。true を返すと PlaceSearch 側は詳細取得
  //（課金）に進まない。
  const pickSaved = useCallback(
    (googlePlaceId: string) => {
      const saved = findSavedByGoogleId(googlePlaceId);
      if (!saved) return false;
      clearSearch();
      selectSaved(saved.id);
      return true;
    },
    [findSavedByGoogleId, clearSearch, selectSaved],
  );

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

  // 「地図未登録」バッジの × : 地図に登録せずこのまま使う。座標は付けない
  // ＝あとで一覧の行からいつでも地図に登録し直せる（一方的な通知の抑制）。
  const dismissLocation = useCallback(
    (id: string) => {
      void (async () => {
        const ok = await confirmDialog({
          title: t("dismissLocationTitle"),
          body: t("dismissLocationBody"),
          confirmLabel: tCommon("confirm"),
          destructive: false,
        });
        if (!ok) return;
        const { error } = await dismissPlaceLocationAction(tripId, id);
        if (error) {
          toast(error);
          return;
        }
      })();
    },
    [tripId, t, tCommon],
  );
  const finishLocate = useCallback(() => {
    setPendingLocationFor(null);
    setDraft(null);
  }, []);

  if (!apiKey) {
    return (
      <div className="space-y-4">
        <MessageBox kind="warning">{t("noApiKey")}</MessageBox>
        <PlaceList
          places={visiblePlaces}
          selectedId={null}
          locatingId={null}
          dayByPlaceId={dayByPlaceId}
          areaByPlaceId={areaByPlaceId}
          locale={locale}
          onSelect={() => {}}
          onLocate={() => {}}
          onCancelLocate={() => {}}
          onDismissLocation={() => {}}
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
          onDone={clearSearch}
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
          // 2タップ目でここが**新しく開く**ので、その時だけ編集モードで始まる
          // （初期値だけを見るので、広い画面の InfoWindow＝選択と同時にもう
          // 開いている方は今までどおり閲覧モードのまま）。
          startEditing={savedInfoOpen}
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
      onDone={clearSearch}
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
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <PlaceSearch
                query={query}
                onQueryChange={setQuery}
                onClear={clearSearch}
                biasCenter={biasCenter}
                onResults={onResults}
                onPickSaved={pickSaved}
              />
            </div>
            {/* 絞り込み（エリア/日にち/非表示の場所）。地図のピンと一覧の
                両方に効く。iOS の地図右上のフィルタと同じ位置づけ。 */}
            <PlaceFilterMenu
              filter={placeFilter}
              onChange={setPlaceFilter}
              areaOptions={areaOptions}
              dayOptions={dayOptions}
              dismissedCount={dismissedCount}
              showDismissed={showDismissed}
              onToggleDismissed={() => setShowDismissed((v) => !v)}
              locale={locale}
            />
          </div>
        </div>

        <div
          className="fixed inset-x-0 md:static md:inset-auto"
          style={{
            top: MOBILE_TAB_TOP_OFFSET,
            bottom: MOBILE_TAB_BOTTOM_OFFSET,
          }}
          // 地図に触っても一覧シートは閉じない。シートは背後を暗くしておらず
          // 地図はそのまま操作できるので、開いたまま動かせる方が使いやすい
          // （iOS も閉じない。以前は pointerdown で畳んでいたが、パンしようと
          // した瞬間に閉じてしまうという実機フィードバック）。閉じたい時は
          // シートを下にドラッグする。
        >
          <PlaceMap
            places={visiblePlaces}
            memberHueById={memberHueById}
            candidates={candidates}
            selected={selected}
            draft={draft}
            poi={poi}
            onSelectSaved={selectSaved}
            onSelectCandidate={selectCandidate}
            onCloseInfo={closeInfo}
            onDismissSelection={dismissSelection}
            onCloseList={
              showPlacesSheet && placesSheetOpen
                ? () => setPlacesSheetOpen(false)
                : undefined
            }
            // 保存済みの場所は2タップ目まで詳細シートを出さない（候補・POI は
            // 選択＝詳細なのでそのまま出す）。
            infoSheetOpen={selected?.kind !== "saved" || savedInfoOpen}
            onMapTap={onMapTap}
            onDraftMove={onDraftMove}
            onCloseDraft={closeDraft}
            onPoiSelect={showPoi}
            infoContent={infoContent}
            draftContent={draftContent}
            locating={!!pendingLocationFor}
            className="h-full w-full rounded-none border-0 md:h-[32rem] md:rounded-md md:border md:border-foreground/10"
          />
        </div>

        {/* 場所一覧のボトムシート。狭い画面かつ場所タブが表示中の時だけ描画する
            （Drawer.Portal は document.body に直接ポータルするため、他タブ表示中に
            親の hidden/block だけでは隠せない。isActive で明示的に出し分ける）。
            form-popover.tsx の NarrowSheet と同じ viewport 基準の fixed+明示的height
            パターン。タブバーの上に重ねる（他のボトムシートと同じ）。
            （container prop で地図パネルに閉じ込める案は snapPoints の内部
            計算と噛み合わずレイアウトが壊れたため不採用）。 */}
        {/* 一覧を開く浮島ボタン（タブバーの上に浮かせる）。常設シートをやめ、
            押した時だけシートを出す＝閉じている間は地図が全部見える（iOS と
            同形）。ガラス調は tabbar と同じ「半透明＋backdrop-blur」。 */}
        {showPlacesSheet && !placesSheetOpen && (
          <button
            type="button"
            onClick={() => {
              setSnapIndex("large");
              setPlacesSheetOpen(true);
            }}
            aria-label={t("openList")}
            // 下端は地図上の他のオーバーレイ（縮尺バー・現在地）と同じ線
            // ＝Google ロゴのすぐ上。以前は 12px で、帰属表示に重なっていた。
            style={{
              bottom: `calc(${MOBILE_TAB_BOTTOM_OFFSET} + ${MAP_OVERLAY_BOTTOM_PX}px)`,
            }}
            className="fixed left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-foreground/10 bg-background/75 px-4 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur-lg backdrop-saturate-150 transition active:scale-95 md:hidden"
          >
            <ChevronIcon size={16} className="-rotate-90" />
            {/* 検索結果が残っている間はそちらの件数を出す。一覧を下げても結果は
                捨てないので、このボタンがそのまま「開き直す手」になる。 */}
            {inCandidates
              ? t("searchResultCount", { count: candidates.length })
              : t("placeCountLabel", { count: visiblePlaces.length })}
          </button>
        )}

        {showPlacesSheet && placesSheetOpen && (
          <Drawer.Root
            open
            modal={false}
            snapPoints={snapPoints}
            activeSnapPoint={activeSnap}
            setActiveSnapPoint={(snap) =>
              setSnapIndex(snap === snapPoints[0] ? "small" : "large")
            }
            scrollLockTimeout={0}
            repositionInputs={false}
            // このシートだけ、下げる/閉じるは**取っ手のドラッグ限定**にする。
            // 中身が一覧＝上下に送る操作が主で、上へ送っている途中にシート自体が
            // 下がってしまうことがあった（スクロールの上端に着いた瞬間にドラッグが
            // シートへ渡る、vaul の標準の受け渡し）。一覧は「送る」に専念させ、
            // シートを動かすのは取っ手だけにした方が手元が安定する。
            // 他のボトムシート（NarrowSheet 側のフォーム類）は中身が短くボディ
            // ドラッグで閉じられた方が速いので、そちらは付けない。
            handleOnly
            onOpenChange={(next) => {
              if (next) return;
              setPlacesSheetOpen(false);
              // 閉じ切ったら選択も解く（開き直した時に前の選択が残らない）。
              dismissSelection();
            }}
          >
            <Drawer.Portal>
              <Drawer.Content
                aria-label={t("placesListLabel")}
                // 地図がこのシートに覆われている高さを実測するための目印
                // （place-map の MapController が拾う）。
                data-bottom-sheet
                // 高さは 100dvh（CSS単位）ではなく、段の計算と vaul のオフセット
                // 計算が使っているのと同じ window.innerHeight の実測値（px）。
                // dvh と innerHeight は iOS Safari で一致しないことがあり、ズレた
                // ぶんシートの静止位置が計算と食い違う（NarrowSheet と同種の
                // 「配置と基準の不一致」バグ）。
                // bottom は 0（タブバーの上に浮かせるオフセットは持たない）。
                // オフセットを持つと vaul の px snapPoint（viewport 下端起点）と
                // 二重に効いて狙いより下に出る。
                // z-40: 下タブバー（z-30）より上に重ねる。他のボトムシートと
                // 同じく画面の一番上に乗せる形（iOS の一覧シートも同じ）。
                // 背後は暗くしない＝地図はそのまま見えて操作もできる
                // （iOS の sheetLargestUndimmedDetentIndex="last" と同じ）。
                style={{ height: `${viewportHeight}px` }}
                className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t border-foreground/10 bg-background shadow-[0_-4px_16px_rgba(0,0,0,0.12)] outline-none md:hidden"
              >
                <Drawer.Title className="sr-only">
                  {t("placesListLabel")}
                </Drawer.Title>
                <div
                  ref={listChromeRef}
                  className="relative flex shrink-0 cursor-grab flex-col items-center gap-1.5 pb-2 pt-2.5 active:cursor-grabbing"
                >
                  <Drawer.Handle className="!h-1.5 !w-9" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {inCandidates
                      ? t("searchResultCount", { count: candidates.length })
                      : t("placeCountLabel", { count: visiblePlaces.length })}
                  </span>
                  {/* 検索結果の時だけ × を出す（本家 Google マップと同じ）。
                      ボトムシートには普通 × を置かない（取っ手を下げれば閉じると
                      分かるため）が、ここは「シートを下げる」＝結果を残したまま
                      畳むで、検索そのものをやめる操作が別に要る。役割は検索欄の
                      × と同じ＝押すと結果も地図のピンも消える。 */}
                  {inCandidates && (
                    <CloseButton
                      label={t("searchClear")}
                      onClick={clearSearch}
                      iconSize={20}
                      // 本家 Google マップと同じく、丸い地を敷いてボタンらしく
                      // 見せる（× 閉じるの既定は地を持たないが、ここは検索を
                      // やめる操作＝見つけてもらう必要があるので目立たせる）。
                      // 地は前景色の α 重ね、hover は一段濃く。
                      className="absolute right-2 top-1.5 h-9 w-9 bg-foreground/10 text-muted-foreground hover:bg-foreground/20 hover:text-foreground"
                    />
                  )}
                </div>
                <div
                  ref={listMeasureRef}
                  // 一覧に使える高さは**今の段で画面に見えている分**まで。
                  // Drawer.Content の高さは常に画面いっぱいで、段はそれを下へ
                  // ずらして表示するので、flex-1 のままだと器の高さが「見えて
                  // いる分」より大きくなる＝中身が収まってしまい、画面の外に
                  // はみ出した行にスクロールで辿り着けない（選択中は段が1つに
                  // 固定されて広げられないので、下の方の行が選べなくなる）。
                  style={{
                    maxHeight: Math.max(0, activeSnapPx - listChromeH),
                  }}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
                >
                  {inCandidates ? (
                    <CandidateList
                      candidates={candidates}
                      selectedPlaceId={
                        selected?.kind === "candidate" ? selected.placeId : null
                      }
                      onSelect={selectCandidate}
                    />
                  ) : (
                    <PlaceList
                      framed={false}
                      places={visiblePlaces}
                      selectedId={
                        selected?.kind === "saved" ? selected.id : null
                      }
                      locatingId={pendingLocationFor?.id ?? null}
                      dayByPlaceId={dayByPlaceId}
                      areaByPlaceId={areaByPlaceId}
                      locale={locale}
                      onSelect={selectSaved}
                      onLocate={startLocate}
                      onCancelLocate={cancelLocate}
                      onDismissLocation={dismissLocation}
                    />
                  )}
                </div>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        )}

        <div className="hidden md:block">
          <PlaceList
            places={visiblePlaces}
            selectedId={selected?.kind === "saved" ? selected.id : null}
            locatingId={pendingLocationFor?.id ?? null}
            dayByPlaceId={dayByPlaceId}
            areaByPlaceId={areaByPlaceId}
            locale={locale}
            onSelect={selectSaved}
            onLocate={startLocate}
            onCancelLocate={cancelLocate}
            onDismissLocation={dismissLocation}
          />
        </div>
      </div>
    </APIProvider>
  );
}
