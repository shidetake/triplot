"use client";

import { useEffect, useRef, useState } from "react";

import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Combobox } from "@base-ui/react/combobox";

import type { LatLng } from "@/lib/placeMap";
import { SearchIcon } from "@/components/icons";
import { menuItemClass } from "./menu-item";
import { Button } from "@/components/ui/button";
import { inputClass } from "./input-class";
import { CloseButton } from "./close-button";

// 検索結果の候補（保存前）。searchByText 1 回のレスポンスをそのまま
// 吹き出しに再利用するので、ピンごとの追加 Places 呼び出しは発生しない。
export type CandidatePlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  // 地図のクラスタチップ用。region=都道府県/州、locality=市。保存時に格納する。
  region: string | null;
  locality: string | null;
  rating: number | null;
  userRatingCount: number | null;
  // 写真はここで URI まで作るが、課金は <img> が実際に読まれた時。
  // 吹き出しを開くまで <img> を描かないことで Photo 課金を抑える。
  photoUri: string | null;
};

// Google の住所成分から region(州/県) と locality(市) を取り出す。
// searchByText / autocomplete の fetchFields どちらの addressComponents も
// 同じ形（{ types, longText }）なので共有する。
export function extractRegion(
  components:
    | { types: string[]; longText: string | null }[]
    | null
    | undefined,
): { region: string | null; locality: string | null } {
  const pick = (type: string) =>
    components?.find((c) => c.types.includes(type))?.longText ?? null;
  return {
    region: pick("administrative_area_level_1"),
    locality: pick("locality") ?? pick("sublocality_level_1"),
  };
}

// Enterprise ティア。これ以上のフィールド（営業時間/電話等）は要求しない。
// addressComponents は住所系SKUで、現状の課金ティアを上げない。
const FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
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
  // selectFirst=true は autocomplete 確定経路のシグナル。呼び出し側で
  // results[0] を「候補ピン選択中（吹き出し開く）」状態にする。
  onResults: (
    results: CandidatePlace[],
    opts?: { selectFirst?: boolean },
  ) => void;
}) {
  const placesLib = useMapsLibrary("places");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // event-form の PlacePicker と同方針の autocomplete。入力中に候補を出し、
  // 選ぶと「その1件だけが検索結果」として扱う。検索ボタンは温存（曖昧語で
  // 20件並べたいケース用）。殻（候補リスト＋開閉＋キーボード＋外側クリック＋
  // a11y）は Base UI Combobox に委ね、Google 非同期取得と詳細解決だけ自前。
  const [sug, setSug] = useState<google.maps.places.AutocompleteSuggestion[]>(
    [],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ready = !!placesLib;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // セッショントークン: autocomplete と直後の Place Details を 1 セッション扱いに
  // して課金を抑える。pick 完了でリセット。
  const ensureToken = () => {
    if (!placesLib) return undefined;
    if (!tokenRef.current) {
      tokenRef.current = new placesLib.AutocompleteSessionToken();
    }
    return tokenRef.current;
  };

  const fetchSuggestions = (q: string) => {
    if (!placesLib || q.trim().length < 2) {
      setSug([]);
      return;
    }
    const sessionToken = ensureToken();
    void (async () => {
      try {
        const { suggestions } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: q,
            language: "ja",
            region: "jp",
            sessionToken,
            locationBias: { center: biasCenter, radius: 30000 },
          });
        setSug(suggestions.filter((s) => s.placePrediction).slice(0, 6));
      } catch {
        setSug([]);
      }
    })();
  };

  const onType = (v: string) => {
    onQueryChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 300);
  };

  // ドロップダウンから 1 件を確定 → fetchFields で詳細を取って onResults 1 件で返す。
  // 検索ボタン経路と同じ CandidatePlace の形で渡すので、地図/吹き出しの下流は不変。
  const pick = (sug: google.maps.places.AutocompleteSuggestion) => {
    const pred = sug.placePrediction;
    if (!pred) return;
    const place = pred.toPlace();
    setSug([]);
    setPending(true);
    setError(null);
    void (async () => {
      try {
        await place.fetchFields({ fields: FIELDS });
        const loc = place.location;
        if (!place.id || !loc) {
          setError("場所の詳細を取得できませんでした");
          return;
        }
        const cp: CandidatePlace = {
          placeId: place.id,
          name: place.displayName ?? pred.text.text,
          address: place.formattedAddress ?? "",
          lat: loc.lat(),
          lng: loc.lng(),
          ...extractRegion(place.addressComponents),
          rating: place.rating ?? null,
          userRatingCount: place.userRatingCount ?? null,
          photoUri: place.photos?.[0]?.getURI({ maxWidth: 400 }) ?? null,
        };
        onQueryChange(cp.name);
        onResults([cp], { selectFirst: true });
      } catch {
        setError("場所の詳細取得に失敗しました");
      } finally {
        tokenRef.current = null; // セッション終了 → 次回入力で新トークン
        setPending(false);
        inputRef.current?.blur();
      }
    })();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!placesLib || !q || pending) return;

    // 検索ボタン経路では autocomplete セッションは「中断」扱い。新しいトークンに。
    tokenRef.current = null;
    setSug([]);
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
            ...extractRegion(p.addressComponents),
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

  const sugLabel = (s: google.maps.places.AutocompleteSuggestion) =>
    s.placePrediction?.mainText?.text ?? s.placePrediction?.text.text ?? "";

  return (
    <Combobox.Root
      items={sug}
      // 候補は自前で用意（Google 非同期取得）。内部フィルタは無効化。
      filter={null}
      itemToStringLabel={sugLabel}
      // 入力テキストは query で制御。タイピング時だけ onType（選択時の自動入力は無視）。
      inputValue={query}
      onInputValueChange={(value, details) => {
        if (details.reason === "input-change") onType(value);
      }}
      // 候補の選択（クリック/Enter）→ その1件を詳細取得して onResults。
      onValueChange={(s) => {
        if (s) pick(s as google.maps.places.AutocompleteSuggestion);
      }}
    >
      {/* 検索ボタン（テキスト検索）は form の submit で温存。候補が開いていて
          ハイライト中なら Combobox が Enter を奪って候補確定する（submit しない）。 */}
      <form onSubmit={onSubmit} className="space-y-1" autoComplete="off">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Combobox.Input
              ref={inputRef}
              placeholder="パンケーキ"
              autoComplete="off"
              className={`block w-full min-w-0 pr-9 ${inputClass}`}
            />
            {query && (
              <CloseButton
                label="検索をクリア"
                onClick={() => {
                  setSug([]);
                  onClear();
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
              />
            )}
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!ready || pending}
            aria-label="検索"
            title="検索"
            className="shrink-0"
          >
            <SearchIcon size={18} />
          </Button>
        </div>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-20">
            <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-md border border-foreground/10 bg-white shadow-lg">
              <Combobox.List>
                {(s: google.maps.places.AutocompleteSuggestion) => (
                  <Combobox.Item
                    key={s.placePrediction?.placeId ?? sugLabel(s)}
                    value={s}
                    className={`block ${menuItemClass} data-[highlighted]:bg-foreground/10`}
                  >
                    <span className="font-medium">
                      {s.placePrediction!.mainText?.text ??
                        s.placePrediction!.text.text}
                    </span>
                    {s.placePrediction!.secondaryText?.text && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.placePrediction!.secondaryText.text}
                      </span>
                    )}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>

        {!ready && (
          <p className="text-xs text-muted-foreground">地図を読み込み中...</p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </Combobox.Root>
  );
}
