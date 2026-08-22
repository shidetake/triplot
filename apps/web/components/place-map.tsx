"use client";

import {
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AdvancedMarker,
  InfoWindow,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

/** <html class> の "dark" を MutationObserver で監視し、colorScheme 文字列を返す。 */
function useMapColorScheme(): "DARK" | "LIGHT" {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"));
    });
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark ? "DARK" : "LIGHT";
}

import {
  CANDIDATE_LABEL,
  CANDIDATE_LABEL_GAP,
  candidatePinSize,
} from "@triplot/shared/placeMarker";
import {
  estimateLabelBox,
  type LabelPlacement,
  layoutLabels,
  type MapRegion,
  markerGeometry,
  projectPoint,
} from "@triplot/shared/mapLabelLayout";
import { iconKeyForGoogleType } from "@triplot/shared/placeIcons";

import { CandidatePin } from "./candidate-pin";

import {
  boundsOf,
  centerOf,
  type Cluster,
  clusterPlaces,
  dominantCluster,
  type LatLng,
  TOKYO,
} from "@triplot/shared/placeMap";

import { pinColors } from "@triplot/shared/memberColors";
import { GREEN_HUE } from "@triplot/shared/eventColor";
import { useTranslations } from "next-intl";

import { NarrowSheet } from "./form-popover";
import { MapControls } from "./map-controls";
import { PlaceIcon, type PlaceRow } from "./place-list";
import { type CandidatePlace, extractRegion } from "./place-search";
import { useMediaQuery } from "./use-media-query";
import { cn } from "@/lib/utils";
import { NARROW_SCREEN_QUERY } from "@/lib/mobileTabChrome";

// タッチの長押し検出で任意地点に仮ピンを置く（iOS Safari は長押し→
// contextmenu が安定しないため自前実装）。<Map> の子として描画し、
// useMap でマップ DOM とオーバーレイ投影に触る。
//
// 同じ touch リスナで「直近にタッチがあったか」も記録する。click の
// domEvent 種別判定は iOS で当てにならない（タップの合成 click が
// MouseEvent 系で来て PC と区別できない）ので、自由ピンの click ドロップは
// 「直近に touch が無い＝マウス」のときだけにする（タッチ端末は touch を
// 出す・マウスは出さない＝確実）。
function LongPressPin({
  onLongPress,
  ignoreNextMapClick,
  recentTouchUntil,
}: {
  onLongPress: (p: LatLng) => void;
  ignoreNextMapClick: MutableRefObject<boolean>;
  recentTouchUntil: MutableRefObject<number>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const div = map.getDiv();
    // 投影（screen px → latLng）を得るための空オーバーレイ。
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => {};
    overlay.draw = () => {};
    overlay.onRemove = () => {};
    overlay.setMap(map);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let sx = 0;
    let sy = 0;
    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const onStart = (ev: TouchEvent) => {
      recentTouchUntil.current = performance.now() + 700;
      // 新しいジェスチャ開始。前ジェスチャで click が来ず残ったフラグを掃除。
      ignoreNextMapClick.current = false;
      if (ev.touches.length !== 1) {
        clear();
        return;
      }
      sx = ev.touches[0].clientX;
      sy = ev.touches[0].clientY;
      clear();
      timer = setTimeout(() => {
        timer = null;
        const proj = overlay.getProjection();
        if (!proj) return;
        const rect = div.getBoundingClientRect();
        const ll = proj.fromContainerPixelToLatLng(
          new google.maps.Point(sx - rect.left, sy - rect.top),
        );
        if (ll) {
          // 長押しで draft を出した。指を離した後に来る合成 click を
          // 1 回だけ確実に食う（タイミング非依存。これが無いと
          // touchend→click が "draft 上の余白タップ→閉じる" に化ける）。
          ignoreNextMapClick.current = true;
          onLongPress({ lat: ll.lat(), lng: ll.lng() });
        }
      }, 500);
    };
    const onMove = (ev: TouchEvent) => {
      if (!timer) return;
      const t = ev.touches[0];
      if (
        t &&
        (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10)
      ) {
        clear(); // pan とみなしてキャンセル
      }
    };
    const onEnd = () => {
      clear();
      recentTouchUntil.current = performance.now() + 700;
    };
    div.addEventListener("touchstart", onStart, { passive: true });
    div.addEventListener("touchmove", onMove, { passive: true });
    div.addEventListener("touchend", onEnd, { passive: true });
    div.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      clear();
      div.removeEventListener("touchstart", onStart);
      div.removeEventListener("touchmove", onMove);
      div.removeEventListener("touchend", onEnd);
      div.removeEventListener("touchcancel", onEnd);
      overlay.setMap(null);
    };
  }, [map, onLongPress, ignoreNextMapClick, recentTouchUntil]);

  return null;
}

// InfoWindow をマーカーに被せないための上方向オフセット(px)。
// 雫ピンと丸アイコンで高さが違うので 2 種類。雫は「検索候補の選択中」と
// 「自由(draft)ピン」で同じ要素なので必ず同じ値を使う（定数で一元化）。
// RedPin の translateY を動かしたら、その移動 px ぶん必ずここも同じだけ
// 動かす（隙間ができないよう連動）。-13% は -46% から +33pt = 34px の
// 約33% ≒ 11px ピンを下げたので、-47 から +11 して -36。
const INFO_OFFSET_PIN = -36; // RedPin（赤い雫。候補・保存済みの選択中）
const INFO_OFFSET_ICON = -27; // ベースマップ POI 既存アイコン

// 本家 Google の赤い雫ピン（Material location_on）。translateY で先端を
// マーカーのアンカー（＝クリック/座標点）に合わせる。値を大きく(負に)
// するほどピンは上にズレる。検索候補の選択時と自由（draft）ピンで共用。
function RedPin() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 -960 960 960"
      aria-hidden
      style={{
        transform: "translateY(-13%)",
        filter: "drop-shadow(0 1px 1px rgba(0,0,0,.35))",
      }}
    >
      <path
        d="M458.5-103.5Q448-107 440-115q-42-38-91-87.5T258-309q-42-57-70-119t-28-124q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 62-28 124t-70 119q-42 57-91 106.5T520-115q-8 8-18.5 11.5T480-100q-11 0-21.5-3.5Z"
        fill="#EA4335"
        stroke="#ffffff"
        strokeWidth="22"
      />
      <circle cx="480" cy="-560" r="92" fill="#A50E0E" />
    </svg>
  );
}

export type Selection =
  | { kind: "saved"; id: string }
  | { kind: "candidate"; placeId: string }
  // POI タップ: 既存のベースマップ POI を選択中。マーカーは出さず
  // （Google のアイコンをそのまま見せる）吹き出しだけ出す。
  | { kind: "poi"; placeId: string };

// 表示集合が変わったときだけ地図を fit し直すためのキー。
function pointsKey(points: LatLng[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
}

function MapController({
  points,
  panTo,
}: {
  points: LatLng[];
  panTo: LatLng | null;
}) {
  const map = useMap();
  const key = pointsKey(points);

  useEffect(() => {
    if (!map) return;
    if (points.length === 0) {
      map.setCenter(TOKYO);
      map.setZoom(11);
    } else if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(15);
    } else {
      const b = boundsOf(points)!;
      map.fitBounds(
        { south: b.south, west: b.west, north: b.north, east: b.east },
        60,
      );
    }
    // points 自体ではなく key（集合の同一性）で発火させる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  // ピン/一覧から選択されたらその位置へ寄せる（吹き出しが画面外に出ないように）。
  // 本家 Google マップと同じく「ズームは一切変えずパンだけ」。
  //
  // 寄せ先は地図の中央ではなく「**ボトムシートに隠れていない部分**の中央」。
  // 選択するとシートがせり上がって地図の下半分を覆うので、素直に中央へ寄せると
  // 選んだピンがそのシートの裏に入ってしまう。Maps JS には地図全体の padding が
  // 無いので、覆われている高さのぶんだけ panBy でずらす。
  //
  // 覆っている高さは prop で受け取らず DOM から実測する: 覆う可能性のあるシート
  // （場所一覧・候補の吹き出し）は高さの決まり方がそれぞれ違ううえ、ドラッグや
  // 中身の実測で開いている間も変わるため。シート側に data-bottom-sheet を付けて
  // あるので、それを地図の矩形と突き合わせれば実際の重なりが分かる。
  useEffect(() => {
    if (!map || !panTo) return;

    // 今このフレームで地図が覆われている高さ（と、そこから決まる寄せ量）。
    const measure = () => {
      const mapRect = map.getDiv().getBoundingClientRect();
      let coveredPx = 0;
      for (const el of document.querySelectorAll<HTMLElement>(
        "[data-bottom-sheet]",
      )) {
        const r = el.getBoundingClientRect();
        if (r.height === 0 || r.top >= mapRect.bottom) continue;
        coveredPx = Math.max(
          coveredPx,
          mapRect.bottom - Math.max(r.top, mapRect.top),
        );
      }
      const visibleH = Math.max(0, mapRect.height - coveredPx);
      return {
        mapRect,
        visibleH,
        // 覆いが地図をほぼ埋めている時は寄せ先を作れないので素直に中央へ。
        offsetY: visibleH > 80 ? coveredPx / 2 : 0,
      };
    };

    const panToTarget = (offsetY: number) => {
      map.panTo(panTo);
      // panTo は地図の中央に置くので、覆われているぶんの半分だけ地図を下へ
      // ずらす＝ピンが見えている部分の中央へ上がってくる。
      if (offsetY > 0) map.panBy(0, offsetY);
    };

    // 1回目: 選択した合図として寄せる。ほぼ寄せ先にあるなら動かさない（本家
    // 同様、少しでも端にあれば中央へ寄せる）。
    const { mapRect, offsetY } = measure();
    const b = map.getBounds();
    const c = map.getCenter();
    let alreadyThere = false;
    if (b && c) {
      const span = b.toSpan();
      const targetLat = c.lat() - (offsetY / mapRect.height) * span.lat();
      alreadyThere =
        Math.abs(panTo.lng - c.lng()) / span.lng() < 0.1 &&
        Math.abs(panTo.lat - targetLat) / span.lat() < 0.1;
    }
    if (!alreadyThere) panToTarget(offsetY);

    // 2回目: シートがせり上がりきってから、**ピンが本当に隠れている時だけ**
    // 持ち上げる。1回目の時点ではシートがまだ動いている途中で覆う高さが
    // 分からないため、この確認が要る。
    //
    // ここは緯度の差ではなく**ピンの画面上の位置**で判定する。緯度差で見ると、
    // 1回目のパンで既に見えている場合でも「寄せ先からは離れている」ので動いて
    // しまい、見えているのに最後にひと跳ねする（実機フィードバック）。
    const id = setTimeout(() => {
      const m = measure();
      const bb = map.getBounds();
      const cc = map.getCenter();
      if (!bb || !cc) return;
      const span = bb.toSpan();
      const { x, y } = projectPoint(
        {
          latitude: cc.lat(),
          longitude: cc.lng(),
          latitudeDelta: span.lat(),
          longitudeDelta: span.lng(),
        },
        { width: m.mapRect.width, height: m.mapRect.height },
        { lat: panTo.lat, lng: panTo.lng },
      );
      // 端ぎりぎりは「見えている」と数えない（ピンの高さぶんの余裕を見る）。
      const margin = 48;
      const onScreen =
        x > margin &&
        x < m.mapRect.width - margin &&
        y > margin &&
        y < m.visibleH - margin;
      if (onScreen) return;
      panToTarget(m.offsetY);
    }, 450);
    return () => clearTimeout(id);
  }, [map, panTo]);

  return null;
}

export function PlaceMap({
  places,
  memberHueById,
  candidates,
  selected,
  draft,
  onSelectSaved,
  onSelectCandidate,
  onCloseInfo,
  onDismissSelection,
  onCloseList,
  onMapTap,
  onDraftMove,
  onCloseDraft,
  onPoiSelect,
  poi,
  infoContent,
  infoSheetOpen = true,
  draftContent,
  locating,
  className,
}: {
  places: PlaceRow[];
  // 候補ピン（tentative=true）の地色を作成者の hue で塗るのに使う。
  memberHueById: Map<string, number | null>;
  candidates: CandidatePlace[];
  selected: Selection | null;
  draft: LatLng | null;
  poi: CandidatePlace | null;
  onSelectSaved: (id: string) => void;
  onSelectCandidate: (placeId: string) => void;
  onCloseInfo: () => void;
  // 地図の何もない所のタップで一段戻る時に呼ぶ。選択を解いて詳細も閉じる
  // （シートを閉じるだけの onCloseInfo とは別＝そちらは選択を残す）。
  onDismissSelection: () => void;
  // 場所一覧のシートを開いている時だけ渡す（閉じる手）。選択も仮ピンも無い時に
  // 地図の何もない所をタップしたら、最後の一段としてこれを閉じる。
  onCloseList?: () => void;
  onMapTap: (p: LatLng) => void;
  onDraftMove: (p: LatLng) => void;
  onCloseDraft: () => void;
  onPoiSelect: (c: CandidatePlace) => void;
  infoContent: ReactNode;
  // 狭い画面で infoContent をボトムシートとして出すか。保存済みの場所は
  // 「1タップ目＝一覧で選択、2タップ目＝詳細」なので、呼び出し側が段を持つ。
  // 広い画面の InfoWindow はこの旗に関係なく選択に追従する（一覧が常に隣に
  // 見えているので段を分ける意味が無い）。
  infoSheetOpen?: boolean;
  draftContent: ReactNode;
  // draftContent が LocateInfo（既存 place への位置設定。onDone が「保存成功」
  // 専用の意味を持ち、ボトムシートの汎用クローズに置き換えられると困る）か
  // どうか。true の間は draft を狭い画面でもポップアップのまま出す。
  locating: boolean;
  // 呼び出し側で外枠（高さ・角丸・枠線）を上書きしたい時に渡す（モバイルタブの全画面化等）。
  className?: string;
}) {
  const t = useTranslations("place");
  // 狭い画面はピンのフォームをボトムシートで出す（NARROW_SCREEN_QUERY は
  // places-section.tsx のレイアウト切替と同じ閾値。単一の真実は lib/mobileTabChrome.ts）。
  const narrow = useMediaQuery(NARROW_SCREEN_QUERY);
  // AdvancedMarker は Map ID 必須（無料。Google Cloud で発行して env に入れる）。
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
  const colorScheme = useMapColorScheme();
  const placesLib = useMapsLibrary("places");
  // 長押しで仮ピンを置いた直後に来る合成 click を 1 回だけ食う（タイミング
  // 非依存。これが無いと touchend→click が draft 上の余白タップ＝閉じる
  // に化け、指を離した瞬間に仮ピンが消える）。
  const ignoreNextMapClick = useRef(false);
  // 直近にタッチがあった締切。これ以内の click はタッチ由来とみなし、
  // 自由ピンの click ドロップ（＝マウス専用）を行わない。
  const recentTouchUntil = useRef(0);

  // 未マップ（自由入力）の場所は座標が無いので地図に出さない。
  const mappedPlaces = useMemo(
    () =>
      places.filter(
        (p): p is PlaceRow & { lat: number; lng: number } =>
          p.lat != null && p.lng != null,
      ),
    [places],
  );

  // 保存済みピンをエリアでクラスタリング（検索中はチップを出さない）。
  const clusters = useMemo<Cluster[]>(
    () =>
      candidates.length > 0
        ? []
        : clusterPlaces(
            mappedPlaces.map((p) => ({
              lat: p.lat,
              lng: p.lng,
              region: p.region,
              locality: p.locality,
            })),
          ),
    [candidates, mappedPlaces],
  );
  const main = useMemo(() => dominantCluster(clusters), [clusters]);

  // 既定でズームする点群: 検索中は候補、エリアが割れていれば主役クラスタ、
  // 主役が決まらなければ全ピン。
  const focusPoints: LatLng[] = useMemo(() => {
    if (candidates.length > 0)
      return candidates.map((c) => ({ lat: c.lat, lng: c.lng }));
    if (main) return main.points.map((p) => ({ lat: p.lat, lng: p.lng }));
    return mappedPlaces.map((p) => ({ lat: p.lat, lng: p.lng }));
  }, [candidates, main, mappedPlaces]);

  // fitBounds 前の初期中心。bounds 中心なら日付変更線跨ぎでも正しい側に出る。
  const initBounds = boundsOf(focusPoints);
  const initialCenter = initBounds ? centerOf(initBounds) : TOKYO;

  const selectedPos: LatLng | null = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "saved") {
      const p = places.find((x) => x.id === selected.id);
      return p && p.lat != null && p.lng != null
        ? { lat: p.lat, lng: p.lng }
        : null;
    }
    if (selected.kind === "poi") {
      return poi ? { lat: poi.lat, lng: poi.lng } : null;
    }
    const c = candidates.find((x) => x.placeId === selected.placeId);
    return c ? { lat: c.lat, lng: c.lng } : null;
  }, [selected, places, candidates, poi]);

  return (
    // className はこの外枠（サイズ・角丸・枠線）に当てる。地図 div 自身に
    // h-full を持たせて祖先が全部 h-full の多段継承にすると、実機で Google
    // Maps の初期化タイミングと噛み合わず何も描画されない不具合が起きたため
    // （祖先の1つが space-y-1 で高さ未確定のまま伝播していたのが実際の原因）、
    // ここを flex-col の唯一の「サイズを持つ箱」にし、地図は flex-1 で
    // 残り領域を埋めるだけにする（percentage-height の多段継承をやめる）。
    <div
      className={cn(
        "flex h-[32rem] w-full flex-col gap-1 overflow-hidden rounded-md border border-foreground/10",
        className,
      )}
    >
      <div className="relative min-h-0 flex-1">
        <Map
          mapId={mapId}
          colorScheme={colorScheme}
          defaultCenter={initialCenter}
          defaultZoom={places.length > 1 ? 11 : 13}
          gestureHandling="greedy"
          disableDefaultUI
          keyboardShortcuts={false}
          // 本家同様、ベースマップの POI（店/施設）アイコンをタップ可能に。
          clickableIcons
          onClick={(e) => {
            // 長押しで置いた直後の合成 click を 1 回だけ食う（draft 即閉じ
            // 防止）。pointerup 由来等で click が touchend より先でも確実。
            if (ignoreNextMapClick.current) {
              ignoreNextMapClick.current = false;
              return;
            }
            // POI アイコンのタップ: placeId が取れる。Google 既定の吹き出しを
            // 止めて、Place Details を 1 回引いて候補として登録フォームへ
            // （ユーザ操作時のみの課金。サジェスト確定と同種）。
            const poiId = e.detail.placeId;
            if (poiId) {
              e.stop();
              // 登録済みの POI なら Details を引かず（課金なし）既存の場所を
              // 開く（同じ店を何度でも追加できてしまう重複登録の防止。iOS と同じ）。
              const saved = places.find((p) => p.google_place_id === poiId);
              if (saved) {
                onSelectSaved(saved.id);
                return;
              }
              if (!placesLib) return;
              // 座標は Details の location でなく「タップした POI アイコンの
              // 座標」を優先する。Details の座標は建物重心などベースマップの
              // POI アイコン描画位置と数 m ずれることがあり、登録後の自前
              // マーカーが POI と二重にずれて見える（iOS と同じ対策）。
              const poiLatLng = e.detail.latLng;
              void (async () => {
                try {
                  const place = new placesLib.Place({ id: poiId });
                  await place.fetchFields({
                    fields: [
                      "id",
                      "displayName",
                      "formattedAddress",
                      "addressComponents",
                      "location",
                    ],
                  });
                  const loc = place.location;
                  if (!place.id || !loc) return;
                  onPoiSelect({
                    placeId: place.id,
                    name: place.displayName ?? t("unknownName"),
                    address: place.formattedAddress ?? "",
                    lat: poiLatLng?.lat ?? loc.lat(),
                    lng: poiLatLng?.lng ?? loc.lng(),
                    ...extractRegion(place.addressComponents),
                    rating: null,
                    userRatingCount: null,
                    // POI タップは Essentials だけ取る（評価も種別も要求しない）。
                    primaryType: null,
                    photoUri: null,
                  });
                } catch {
                  // 取得失敗時は何もしない（空白タップの手動ピンで代替可）
                }
              })();
              return;
            }
            // 何か開いていれば「閉じるだけ」優先。
            // 何もない所のタップは段階的に一段戻す（iOS と同じ）。
            // 選択中なら選択を解く（一覧の選択表示も元に戻る）。
            if (selected) {
              onDismissSelection();
              return;
            }
            if (draft) {
              onCloseDraft();
              return;
            }
            // 一覧を開いているだけ（選択も仮ピンも無い）なら一覧を閉じる
            // ＝iOS の「段階的に一段戻す」の最後の一段。
            if (onCloseList) {
              onCloseList();
              return;
            }
            // PC（マウス）の普通クリックは本家同様その場に自由ピン。
            // 直近に touch があった＝タッチ端末なので落とさない（自由位置
            // はタッチでは長押し）。マウスは touch を出さないので通る。
            if (performance.now() >= recentTouchUntil.current) {
              const ll = e.detail.latLng;
              if (ll) onMapTap({ lat: ll.lat, lng: ll.lng });
            }
          }}
          style={{ width: "100%", height: "100%" }}
        >
          <MapController points={focusPoints} panTo={selectedPos} />
          {/* 現在地・方位磁針・縮尺バー（iOS の場所タブと同じ仕様）。
              位置を指定するモード中は地図に集中させるため出さない。 */}
          <MapControls hidden={locating} />
          <LongPressPin
            onLongPress={onMapTap}
            ignoreNextMapClick={ignoreNextMapClick}
            recentTouchUntil={recentTouchUntil}
          />

          {mapId &&
            mappedPlaces.map((p) => {
              // 候補（tentative=true）は半透明 + 作成者のメンバー色で塗る。
              // 確定（tentative=false）は固定のグリーンで塗る。
              // 選択中は本家 Google マップと同じく赤ピンに差し替えて表示する
              // （選択を外すと元のピンに戻る。iOS と同じ挙動）。
              const creatorHue = memberHueById.get(p.created_by_member_id);
              const isDarkMap = colorScheme === "DARK";
              // 未確定は作成者のメンバー色、確定は予約色（GREEN_HUE）。
              // 地図はテーマを自前で解決済み（colorScheme）なので対から選ぶ。
              const pin = pinColors(
                p.tentative ? creatorHue : GREEN_HUE,
                p.tentative,
              );
              const mode = isDarkMap ? "dark" : "light";
              const isSel = selected?.kind === "saved" && selected.id === p.id;
              return (
                <AdvancedMarker
                  key={p.id}
                  position={{ lat: p.lat, lng: p.lng }}
                  title={p.name}
                  onClick={() => onSelectSaved(p.id)}
                >
                  {isSel ? (
                    <RedPin />
                  ) : (
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 shadow"
                      style={{
                        backgroundColor: pin.bg[mode],
                        borderColor: pin.border[mode],
                        color: pin.glyph[mode],
                      }}
                    >
                      <PlaceIcon icon={p.icon} size={16} />
                    </div>
                  )}
                </AdvancedMarker>
              );
            })}

          {mapId && (
            <CandidateMarkers
              candidates={candidates}
              selectedPlaceId={
                selected?.kind === "candidate" ? selected.placeId : null
              }
              dark={colorScheme === "DARK"}
              onSelect={onSelectCandidate}
            />
          )}

          {selected && selectedPos && !narrow && (
            <InfoWindow
              position={selectedPos}
              onCloseClick={onCloseInfo}
              // 横幅は中身側の可変幅（各 *Info の w-[min(16rem,calc(100vw-3rem))]）
              // と globals.css の .gm-style-iw-* 上書きで制御する。maxWidth は
              // Google が中身より狭く頭打ちさせて端切れ・横スクロールの原因に
              // なるので使わない。
              headerDisabled
              // 候補・保存済みは選択中＝雫ピン表示なので深め、POI（Google の
              // アイコンのまま）だけ浅め。
              pixelOffset={[
                0,
                selected.kind === "poi" ? INFO_OFFSET_ICON : INFO_OFFSET_PIN,
              ]}
            >
              {infoContent}
            </InfoWindow>
          )}

          {mapId && draft && (
            <AdvancedMarker
              position={draft}
              draggable
              onDragEnd={(e) => {
                // ドラッグ離し直後に来るマップ click（特に PC）が
                // 「余白タップ→draft 閉じる」に化けるのを 1 回食う。
                ignoreNextMapClick.current = true;
                if (e.latLng) {
                  onDraftMove({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                }
              }}
            >
              {/* 仮ピン＝検索候補の選択時と同じ赤い雫ピン（未保存の点） */}
              <RedPin />
            </AdvancedMarker>
          )}

          {draft && (!narrow || locating) && (
            <InfoWindow
              position={draft}
              onCloseClick={onCloseDraft}
              headerDisabled
              pixelOffset={[0, INFO_OFFSET_PIN]}
            >
              {draftContent}
            </InfoWindow>
          )}
        </Map>
        {/* 狭い画面: 地図ピンのフォームは InfoWindow でなくボトムシートで出す
            （アイコン選択の横幅を確保するため。ui-guidelines「一定幅以上の
            入力フォームは狭い画面ではボトムシート」）。LocateInfo（locating中）
            は onDone が「保存成功」専用の意味を持ち、ボトムシートの汎用クローズ
            （NarrowSheet が onDone を上書きする）と衝突するため対象外のまま
            InfoWindow で出す。 */}
        {narrow && selected && infoContent && infoSheetOpen && (
          <NarrowSheet
            label={
              selected.kind === "saved" ? t("editFormLabel") : t("addFormLabel")
            }
            onClose={onCloseInfo}
            // 地図の上に出すシートなので背後を暗くせず、開いている間も地図を
            // 動かせるままにする（iOS と同じ。本家 Apple/Google マップの場所
            // カードと同じ挙動）。
            undimmed
          >
            {infoContent}
          </NarrowSheet>
        )}
        {narrow && draft && !locating && draftContent && (
          <NarrowSheet
            label={t("addFormLabel")}
            onClose={onCloseDraft}
            undimmed
          >
            {draftContent}
          </NarrowSheet>
        )}
      </div>
      {!mapId && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("noMapId")}
        </p>
      )}
    </div>
  );
}

// 検索候補のマーカー群（ピル＋評価値のピン＋店名ラベル）。iOS の
// CandidateMarker と同じ形で、衝突回避の配置計算も同じ shared 関数に載る
// （layoutLabels / markerGeometry）。ラベルは「置ける分だけ出して、
// 置けない分は隠す」＝本家 Google マップと同じ振る舞い。
function CandidateMarkers({
  candidates,
  selectedPlaceId,
  dark,
  onSelect,
}: {
  candidates: CandidatePlace[];
  selectedPlaceId: string | null;
  dark: boolean;
  onSelect: (placeId: string) => void;
}) {
  const map = useMap();
  const [region, setRegion] = useState<MapRegion | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  // 表示範囲とビューの実寸。どちらもラベルの投影に要る（region → 画面座標）。
  useEffect(() => {
    if (!map) return;
    const div = map.getDiv();
    const readRegion = () => {
      const b = map.getBounds();
      if (!b) return;
      const ne = b.getNorthEast();
      const sw = b.getSouthWest();
      setRegion({
        latitude: (ne.lat() + sw.lat()) / 2,
        longitude: (ne.lng() + sw.lng()) / 2,
        latitudeDelta: Math.abs(ne.lat() - sw.lat()),
        longitudeDelta: Math.abs(ne.lng() - sw.lng()),
      });
    };
    // 再配置は重いので、ジェスチャ確定（idle）だけで振り直す＝iOS と同じ
    // タイミング（本家 Google マップのラベル再配置もこの単位）。
    // 初回の値も外部イベント経由で受け取る（effect の中で直接 setState すると
    // 連鎖レンダーになる。MapControls の region 取得と同じ理由）。idle は地図の
    // 描画が落ち着いた時に、ResizeObserver は observe した直後に一度発火する。
    const listener = map.addListener("idle", readRegion);
    const ro = new ResizeObserver(() =>
      setSize({ width: div.clientWidth, height: div.clientHeight }),
    );
    ro.observe(div);
    return () => {
      listener.remove();
      ro.disconnect();
    };
  }, [map]);

  // 選択中を先頭にして、一番良い位置（右）を優先的に取らせる。
  const placements = useMemo<Record<string, LabelPlacement>>(() => {
    if (!region || !size || candidates.length === 0) return {};
    const items = [...candidates]
      .sort((a, b) =>
        a.placeId === selectedPlaceId
          ? -1
          : b.placeId === selectedPlaceId
            ? 1
            : 0,
      )
      .map((c) => ({
        id: c.placeId,
        lat: c.lat,
        lng: c.lng,
        pin: candidatePinSize(c.rating),
        label: estimateLabelBox(c.name, CANDIDATE_LABEL),
      }));
    return layoutLabels(items, region, size, CANDIDATE_LABEL_GAP);
  }, [candidates, selectedPlaceId, region, size]);

  return (
    <>
      {candidates.map((c) => {
        const isSel = c.placeId === selectedPlaceId;
        const placement = placements[c.placeId] ?? "hidden";
        const pin = candidatePinSize(c.rating);
        const label = estimateLabelBox(c.name, CANDIDATE_LABEL);
        const g = markerGeometry(placement, pin, label, CANDIDATE_LABEL_GAP);
        return (
          <AdvancedMarker
            key={`cand-${c.placeId}`}
            position={{ lat: c.lat, lng: c.lng }}
            title={c.name}
            zIndex={isSel ? 100 : 10}
            anchorPoint={[`${g.anchorX * 100}%`, `${g.anchorY * 100}%`]}
            onClick={() => onSelect(c.placeId)}
          >
            <div
              style={{ position: "relative", width: g.width, height: g.height }}
            >
              <div style={{ position: "absolute", left: g.pinX, top: g.pinY }}>
                <CandidatePin
                  icon={iconKeyForGoogleType(c.primaryType)}
                  rating={c.rating}
                  selected={isSel}
                  dark={dark}
                />
              </div>
              {placement !== "hidden" &&
                g.labelX != null &&
                g.labelY != null && (
                  <span
                    style={{
                      position: "absolute",
                      left: g.labelX,
                      top: g.labelY,
                      width: label.width,
                      fontSize: CANDIDATE_LABEL.fontSize,
                      lineHeight: `${CANDIDATE_LABEL.lineHeight}px`,
                      fontWeight: 500,
                      textAlign:
                        placement === "left"
                          ? "right"
                          : placement === "right"
                            ? "left"
                            : "center",
                      // 地図ラベルと同じハロー付き文字（ライト=濃字+白縁、
                      // ダーク=白字+夜間スタイルの地色縁）。ベースマップの地名より
                      // 一段目立たせる。
                      color: dark ? "#ffffff" : "#202124",
                      textShadow: `0 0 2px ${dark ? "#242f3e" : "#ffffff"}`,
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: label.lines,
                      overflow: "hidden",
                    }}
                  >
                    {c.name}
                  </span>
                )}
            </div>
          </AdvancedMarker>
        );
      })}
    </>
  );
}
