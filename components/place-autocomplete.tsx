"use client";

import { useEffect, useRef, useState } from "react";

import { useMapsLibrary } from "@vis.gl/react-google-maps";

import type { LatLng } from "@/lib/placeMap";

export type PickedPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

// 新 Places API の Autocomplete。セッショントークン必須
// （無いと打鍵ごとに課金される。トークンがあれば候補取得は無料で、
//  選択確定時の Place Details 1 回だけ課金）。
// 候補取得 → 選択で toPlace().fetchFields() でセッションを閉じ、
// トークンを破棄して次回用に作り直す。
export function PlaceAutocomplete({
  biasCenter,
  onPick,
  placeholder,
}: {
  biasCenter: LatLng;
  onPick: (p: PickedPlace) => void;
  placeholder?: string;
}) {
  const placesLib = useMapsLibrary("places");
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const ensureToken = () => {
    if (!placesLib) return undefined;
    if (!tokenRef.current) {
      tokenRef.current = new placesLib.AutocompleteSessionToken();
    }
    return tokenRef.current;
  };

  const runSearch = (q: string) => {
    if (!placesLib || !q.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const sessionToken = ensureToken();
    setPending(true);
    void (async () => {
      try {
        const { suggestions: out } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: q,
            language: "ja",
            region: "jp",
            sessionToken,
            locationBias: { center: biasCenter, radius: 30000 },
          });
        // place 予測のみ（クエリ予測は除く）
        setSuggestions(out.filter((s) => s.placePrediction));
        setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setPending(false);
      }
    })();
  };

  const onChange = (v: string) => {
    setInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 300);
  };

  const pick = (s: google.maps.places.AutocompleteSuggestion) => {
    const pred = s.placePrediction;
    if (!pred) return;
    const place = pred.toPlace();
    setPending(true);
    void (async () => {
      try {
        await place.fetchFields({
          fields: ["id", "displayName", "formattedAddress", "location"],
        });
        const loc = place.location;
        if (!place.id || !loc) return;
        onPick({
          placeId: place.id,
          name: place.displayName ?? pred.text.text,
          address: place.formattedAddress ?? "",
          lat: loc.lat(),
          lng: loc.lng(),
        });
      } finally {
        // セッション終了。次の検索は新トークンで（再利用は課金対象）
        tokenRef.current = null;
        setInput("");
        setSuggestions([]);
        setOpen(false);
        setPending(false);
      }
    })();
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={input}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder ?? "店名・地名で検索（例: 浅草 寿司）"}
        disabled={!placesLib}
        className="mt-1 block w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-black focus:outline-none disabled:bg-zinc-50"
      />
      {!placesLib && (
        <p className="mt-1 text-[11px] text-zinc-500">地図を読み込み中...</p>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg">
          {suggestions.map((s, i) => {
            const pred = s.placePrediction!;
            return (
              <li key={pred.placeId ?? i}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className="block w-full px-2 py-1.5 text-left text-sm hover:bg-zinc-100"
                >
                  <span className="font-medium">
                    {pred.mainText?.text ?? pred.text.text}
                  </span>
                  {pred.secondaryText?.text && (
                    <span className="block truncate text-[11px] text-zinc-500">
                      {pred.secondaryText.text}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {pending && (
        <p className="mt-1 text-[11px] text-zinc-400">検索中...</p>
      )}
    </div>
  );
}
