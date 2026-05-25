"use client";

import type { Visibility } from "@/lib/types/database";

import { ColorBadge } from "./color-badge";

export type PlaceStatus = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  tentative: boolean;
};

export type PlaceRow = {
  id: string;
  name: string;
  // 未マップ（自由入力）の場所は座標・住所・gpid を持たない。
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  formatted_address: string | null;
  region: string | null;
  locality: string | null;
  status_id: string;
  visibility: Visibility;
  note: string | null;
  icon: string;
  created_by_member_id: string;
  created_at: string;
};

// ピンの形（手動選択）。固定パレット。先頭が既定。
export const PLACE_ICONS: { value: string; label: string }[] = [
  { value: "pin", label: "その他" },
  { value: "airport", label: "空港" },
  { value: "lodging", label: "宿" },
  { value: "food", label: "食事" },
  { value: "cafe", label: "カフェ" },
  { value: "bar", label: "バー" },
  { value: "shopping", label: "買い物" },
  { value: "nature", label: "自然・公園" },
  { value: "sightseeing", label: "観光・名所" },
  { value: "beach", label: "ビーチ" },
  { value: "station", label: "駅" },
  { value: "parking", label: "駐車場" },
  { value: "activity", label: "アクティビティ" },
];

// 各カテゴリ → Google 公式 Material Symbols (Rounded, FILL) の SVG パス。
// フォントは使わず inline SVG（依存ゼロ・確実・FOUT無し）。座標系は
// Material Symbols の viewBox "0 -960 960 960"。キーは places.icon に保存する
// 安定キー（pin/airport/lodging… の英字。費用カテゴリと同方式）。
const ICON_PATHS: Record<string, string> = {
  "pin":
    "M458.5-103.5Q448-107 440-115q-42-38-91-87.5T258-309q-42-57-70-119t-28-124q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 62-28 124t-70 119q-42 57-91 106.5T520-115q-8 8-18.5 11.5T480-100q-11 0-21.5-3.5Zm71-407Q550-531 550-560t-20.5-49.5Q509-630 480-630t-49.5 20.5Q410-589 410-560t20.5 49.5Q451-490 480-490t49.5-20.5Z",
  "airport":
    "M409-421 137-311q-20 8-38.5-4T80-350v-18q0-11 5-19.5T98-402l311-219v-188q0-29 21-50t50-21q29 0 50 21t21 50v188l311 219q8 6 13 14.5t5 19.5v18q0 23-18.5 35t-38.5 4L551-421v172l109 76q7 5 11 12.5t4 15.5v19q0 17-13.5 27.5T631-93l-151-46-151 46q-17 5-30.5-5.5T285-126v-19q0-8 4-15.5t11-12.5l109-76v-172Z",
  "lodging":
    "M69.82-200Q57-200 48.5-208.63 40-217.25 40-230v-525q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v364h353v-249q0-24.75 17.63-42.38Q488.25-700 513-700h262q59.81 0 102.41 42.59Q920-614.81 920-555v325q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37v-101H100v101q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63ZM194.5-479.5Q164-510 164-555t30.5-75.5Q225-661 270-661t75.5 30.5Q376-600 376-555t-30.5 75.5Q315-449 270-449t-75.5-30.5Z",
  "food":
    "M285-600v-250q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v250h65v-250q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v249.73q0 58.27-36.5 99.77Q397-459 345-448v338q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63Q285-97.25 285-110v-338q-52-11-88.5-52.5T160-600.27V-850q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v250h65Zm415 200h-85q-12.75 0-21.37-8.63Q585-417.25 585-430v-275q0-69 42.5-122t98.5-53q14 0 24 10.13T760-846v736q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63Q700-97.25 700-110v-290Z",
  "cafe":
    "M190-120q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h580q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H190Zm121-140q-63 0-107-43.5T160-410v-370q0-24.75 17.63-42.38Q195.25-840 220-840h600q24.75 0 42.38 17.62Q880-804.75 880-780v160q0 24.75-17.62 42.37Q844.75-560 820-560h-96v150q0 63-44 106.5T573-260H311Zm413-360h96v-160h-96v160Z",
  "bar":
    "M450-180v-244L134-764q-6-6-9-14.5t-3-16.5q0-19 13-32t32-13h626q19 0 32 13t13 32q0 8-3 16.5t-9 14.5L510-424v244h180q13 0 21.5 8.5T720-150q0 13-8.5 21.5T690-120H270q-13 0-21.5-8.5T240-150q0-13 8.5-21.5T270-180h180ZM281-695h398l83-81H198l83 81Z",
  "shopping":
    "M236-102.21q-21-21.21-21-51T236.21-204q21.21-21 51-21T338-203.79q21 21.21 21 51T337.79-102q-21.21 21-51 21T236-102.21Zm400 0q-21-21.21-21-51T636.21-204q21.21-21 51-21T738-203.79q21 21.21 21 51T737.79-102q-21.21 21-51 21T636-102.21ZM205-801h589.07q22.97 0 34.95 21 11.98 21-.02 42L694-495q-11 19-28.56 30.5T627-453H324l-56 104h461q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H277q-42 0-60.5-28t.5-63l64-118-152-322H81q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32Q68.25-880 81-880h68q9 0 16.2 4.43 7.2 4.44 10.8 12.57l29 62Z",
  "nature":
    "M423-229H177q-18 0-27-16t2-31l157-227h-37q-18.38 0-27.19-16-8.81-16 2.19-31l208-295q4.57-6.12 11.43-9.56 6.86-3.44 13.71-3.44 6.86 0 13.36 3.5Q500-851 505-845l208 295q11 15 2.19 31T688-503h-36l156 227q11 15 2 31t-27 16H538v119q0 12.75-8.5 21.37Q521-80 508.48-80h-55.96Q440-80 431.5-88.63 423-97.25 423-110v-119Z",
  "sightseeing":
    "M480-267q72 0 121-49t49-121q0-73-49-121.5T480-607q-73 0-121.5 48.5T310-437q0 72 48.5 121T480-267Zm0-60q-48 0-79-31.5T370-437q0-48 31-79t79-31q47 0 78.5 31t31.5 79q0 47-31.5 78.5T480-327ZM140-120q-24 0-42-18t-18-42v-513q0-23 18-41.5t42-18.5h147l55-66q8-11 20-16t26-5h184q14 0 26 5t20 16l55 66h147q23 0 41.5 18.5T880-693v513q0 24-18.5 42T820-120H140Z",
  "beach":
    "M772-151 555-368q-10-10-10-23t10-23q10-10 23-10t23 10l217 217q10 10 10 23t-10 23q-10 10-23 10t-23-10Zm-519-51q-12 12-27.5 11T200-205q-70-95-78.5-210.5T166-633q2 33 14.5 73.5T216-475q23 44 55 91t72 92l-90 90Zm131-131q-49-50-85-106.5t-54.5-109Q226-601 226-645t22-68q24-26 69.5-27T418-723q55 18 113 53.5T636-585L384-333Zm380-436q13 10 14 25.5T767-716l-90 90q-44-40-90.5-72t-92-54.5Q449-775 407-787t-76-13q103-55 220-47.5T764-769Z",
  "station":
    "M160-340v-380q0-41 19-71.5t58.5-50q39.5-19.5 100-29T480-880q86 0 146.5 9t99 28.5Q764-823 782-793t18 73v380q0 59-40.5 99.5T660-200l26 26q15 15 7 34.5T663-120q-6 0-11.5-2t-10.5-7l-71-71H390l-71 71q-5 5-10.5 7t-11.5 2q-21 0-29.5-19.5T274-174l26-26q-59 0-99.5-40.5T160-340Zm60-205h234v-155H220v155Zm294 0h226v-155H514v155ZM374-331q16-16 16-39t-16-39q-16-16-39-16t-39 16q-16 16-16 39t16 39q16 16 39 16t39-16Zm290 0q16-16 16-39t-16-39q-16-16-39-16t-39 16q-16 16-16 39t16 39q16 16 39 16t39-16Z",
  "parking":
    "M360-376v196q0 25-17.5 42.5T300-120q-25 0-42.5-17.5T240-180v-600q0-25 17.5-42.5T300-840h228q98 0 165 67t67 165q0 98-67 165t-165 67H360Zm0-120h168q48 0 80-32t32-80q0-48-32-80t-80-32H360v224Z",
  "activity":
    "m257-116 36-83q-17-12-30.5-23.5T235-248q-8 4-17.5 6t-17.5 2q-32 0-54.5-22.5T123-317q0-20 9.5-37.5T156-380q-7-25-11-50t-4-51q0-27 3.5-51.5T156-582q-14-10-23.5-26.5T123-645q0-32 22.5-54.5T200-722q8 0 17 2t17 6q35-36 76.5-60t92.5-37q5-32 26.5-50.5T480-880q29 0 51 19t26 50q51 13 96 34.5t79 59.5q7-2 14-3.5t14-1.5q32 0 54.5 22.5T837-645q0 22-9.5 38T804-582q8 26 11.5 50t3.5 51q0 26-3.5 50.5T804-381q17 11 25 29t8 35q0 32-22.5 54.5T760-240q-8 0-17.5-2t-16.5-6q-13 14-27 26t-30 23l36 83q5 13-2.5 24.5T680-80q-8 0-14.5-4T656-95l-35-77q-17 6-32 11t-32 10q-5 33-26.5 51T480-82q-29 0-50.5-18T403-151q-17-5-32.5-10T341-173l-37 78q-3 7-9.5 11T280-80q-14 0-21-11.5t-2-24.5Zm58-134 71-155q-14-16-21-34.5t-7-40.5q0-50 37.5-86t87.5-36q50 0 84.5 36t34.5 86q0 22-6.5 40.5T574-405l71 155q11-8 22.5-17.5T689-288q-2-6-4-13.5t-2-15.5q0-32 17.5-55t50.5-21q7-20 10.5-42.5T765-481q0-24-3.5-45.5T752-568q-30-4-49.5-26T683-645q0-9 1.5-16t4.5-15q-32-31-67-51t-79-32q-8 13-24.5 23T480-726q-22 0-38-10t-25-23q-44 12-80.5 32T271-674q4 8 5 14.5t1 14.5q0 32-20.5 52.5T209-568q-7 20-10.5 41.5T195-481q0 23 3.5 45t10.5 42q32 6 50 28t18 49q0 9-1.5 16t-3.5 12q10 11 20.5 20.5T315-250Zm45 27q12 5 26.5 10.5T417-203q11-14 26-23.5t37-9.5q22 0 38.5 9.5T543-203q17-4 30.5-9t24.5-10l-65-151q-12 8-26 11.5t-28 3.5q-14 0-28-4t-26-12l-65 151Z",
};

export function PlaceIcon({
  icon,
  size = 18,
  className,
}: {
  icon: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 -960 960 960"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d={ICON_PATHS[icon] ?? ICON_PATHS["pin"]} />
    </svg>
  );
}

export function gmapsUrl(
  p: Pick<PlaceRow, "name" | "google_place_id" | "lat" | "lng">,
): string {
  const base = `https://www.google.com/maps/search/?api=1&query=`;
  // Google 由来は place_id でピンポイント、手動ピンは座標、
  // 未マップ（座標も無い）は名前で検索だけ。
  if (p.google_place_id) {
    return `${base}${encodeURIComponent(p.name)}&query_place_id=${p.google_place_id}`;
  }
  if (p.lat != null && p.lng != null) {
    return `${base}${p.lat},${p.lng}`;
  }
  return `${base}${encodeURIComponent(p.name)}`;
}

export function PlaceList({
  places,
  statuses,
  selectedId,
  locatingId,
  onSelect,
  onLocate,
  onCancelLocate,
}: {
  places: PlaceRow[];
  statuses: PlaceStatus[];
  selectedId: string | null;
  // 現在「位置を指定」モード中の未マップ place の id（あれば）。
  // その行は active 表示にして、クリックで取り消しできるようにする。
  locatingId: string | null;
  onSelect: (id: string) => void;
  // 未マップ行をクリックしたとき: 地図で位置を指定するモードを開始する。
  onLocate: (id: string, name: string) => void;
  onCancelLocate: () => void;
}) {
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  if (places.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        まだ場所はありません。上で検索して地図のピンから追加してください。
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
      {places.map((p) => {
        const status = statusById.get(p.status_id);
        const isSelected = p.id === selectedId;
        const unmapped = p.lat == null;
        const isLocating = unmapped && p.id === locatingId;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() =>
                isLocating
                  ? onCancelLocate()
                  : unmapped
                    ? onLocate(p.id, p.name)
                    : onSelect(p.id)
              }
              className={`flex w-full items-start gap-2 p-3 text-left text-sm transition ${
                isLocating
                  ? "border-l-4 border-amber-400 bg-amber-50"
                  : isSelected
                    ? "bg-zinc-50 hover:bg-zinc-50"
                    : "hover:bg-zinc-50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {status && (
                    <ColorBadge color={status.color}>{status.name}</ColorBadge>
                  )}
                  <span className="font-medium">{p.name}</span>
                  {p.visibility === "private" && (
                    <span className="rounded bg-zinc-100 px-1.5 text-xs text-zinc-600">
                      プライベート
                    </span>
                  )}
                  {unmapped && (
                    <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-700">
                      地図未登録
                    </span>
                  )}
                </div>
                {p.note && (
                  <p className="mt-1 text-xs text-zinc-700">{p.note}</p>
                )}
                {isLocating && (
                  <p className="mt-1 text-xs text-amber-800">
                    地図でクリック / 長押しでピンを置いてください
                  </p>
                )}
              </div>
              {unmapped && (
                <span
                  className={`shrink-0 text-xs ${
                    isLocating ? "text-amber-700" : "text-blue-600"
                  }`}
                >
                  {isLocating ? "やめる" : "ピンを設定"}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
