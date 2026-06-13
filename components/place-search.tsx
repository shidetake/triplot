"use client";

import { useEffect, useRef, useState } from "react";

import { useMapsLibrary } from "@vis.gl/react-google-maps";

import type { LatLng } from "@/lib/placeMap";
import { CloseIcon, SearchIcon } from "@/components/icons";

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

  // event-form の PlacePicker と同方針の autocomplete ドロップダウン。
  // 入力中に候補を出し、選ぶと「その1件だけが検索結果」として扱う。
  // 検索ボタンは温存（曖昧語で20件並べたいケース用）。
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [sug, setSug] = useState<google.maps.places.AutocompleteSuggestion[]>(
    [],
  );
  const boxRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ready = !!placesLib;

  // 外側クリックでドロップダウンを閉じる
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
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

  const onChange = (v: string) => {
    onQueryChange(v);
    setOpen(true);
    setActive(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 300);
  };

  // ドロップダウンから 1 件を確定 → fetchFields で詳細を取って onResults 1 件で返す。
  // 検索ボタン経路と同じ CandidatePlace の形で渡すので、地図/吹き出しの下流は不変。
  const pick = (sug: google.maps.places.AutocompleteSuggestion) => {
    const pred = sug.placePrediction;
    if (!pred) return;
    const place = pred.toPlace();
    setOpen(false);
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
    setOpen(false);
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

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (open && sug.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, sug.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        // 候補が開いてる時は Enter で候補確定（テキスト検索を発火しない）
        e.preventDefault();
        pick(sug[active]);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
    }
  };

  return (
    <form
      ref={boxRef}
      onSubmit={onSubmit}
      className="relative space-y-1"
      autoComplete="off"
    >
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              if (sug.length > 0) setOpen(true);
            }}
            onKeyDown={onKeyDown}
            placeholder="パンケーキ"
            autoComplete="off"
            className="w-full rounded-md border border-foreground/20 bg-white px-3 py-2 pr-9 text-sm focus:border-primary focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setSug([]);
                setOpen(false);
                onClear();
              }}
              aria-label="検索をクリア"
              title="検索をクリア"
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-subtle-foreground transition hover:bg-foreground/10 hover:text-muted-foreground"
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!ready || pending}
          aria-label="検索"
          title="検索"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          <SearchIcon size={18} />
        </button>
      </div>

      {open && sug.length > 0 && (
        <ul className="absolute left-0 right-[44px] top-[42px] z-20 max-h-64 overflow-y-auto rounded-md border border-foreground/10 bg-white shadow-lg">
          {sug.map((s, i) => {
            const pred = s.placePrediction!;
            const isActive = i === active;
            return (
              <li key={pred.placeId ?? i}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    // input が blur する前に確定する。
                    e.preventDefault();
                    pick(s);
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    isActive ? "bg-foreground/10" : "hover:bg-foreground/10"
                  }`}
                >
                  <span className="font-medium">
                    {pred.mainText?.text ?? pred.text.text}
                  </span>
                  {pred.secondaryText?.text && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {pred.secondaryText.text}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!ready && (
        <p className="text-xs text-muted-foreground">地図を読み込み中...</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
