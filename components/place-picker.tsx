"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useMapsLibrary } from "@vis.gl/react-google-maps";

import type { LatLng } from "@/lib/placeMap";

import { extractRegion } from "./place-search";

// 1 つの入力欄に「保存済みの場所」「Google サジェスト」「自由入力」を
// 混ぜて出す、よくあるコンボボックス（Google カレンダーの場所欄や
// Notion / Linear の作成サジェストと同系統）。
//
// 区別の付け方:
//  - ドロップダウンから保存済み行を選ぶ      → place_id 連携
//  - ドロップダウンから Google 行を選ぶ      → 確定で places 作成＋連携
//  - 何も選ばず入力テキストのまま確定        → 自由入力（place_label）
//  - 入力が保存済みの名前と完全一致           → その保存済みへ自動解決
//
// サーバ契約（place_mode / place_id / place_label / g_*）は据え置きで、
// hidden input をこのコンポーネントが状態から組み立てる。

type Resolved =
  | { kind: "saved"; id: string; name: string }
  | {
      kind: "google";
      placeId: string;
      name: string;
      address: string;
      lat: number;
      lng: number;
      region: string | null;
      locality: string | null;
    };

// 自由入力も Model B で place_id に解決済みなので、編集時の初期値は
// 常に保存済み（saved）か無し。自由入力の「初期値」は存在しない。
export type PlacePickerInitial =
  | { kind: "saved"; id: string; name: string }
  | null;

type Row =
  | { type: "saved"; id: string; name: string }
  | { type: "google"; sug: google.maps.places.AutocompleteSuggestion };

export function PlacePicker({
  places,
  biasCenter,
  initial,
  placeholder = "Eggs 'n Things",
}: {
  places: { id: string; name: string }[];
  biasCenter: LatLng;
  initial: PlacePickerInitial;
  placeholder?: string;
}) {
  const placesLib = useMapsLibrary("places");

  const [query, setQuery] = useState(initial ? initial.name : "");
  const [resolved, setResolved] = useState<Resolved | null>(
    initial ? { kind: "saved", id: initial.id, name: initial.name } : null,
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [gSug, setGSug] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);

  const boxRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 入力を編集したら確定済み選択は無効化（= 自由入力候補に戻る）。
  const invalidate = () => setResolved(null);

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

  const ensureToken = () => {
    if (!placesLib) return undefined;
    if (!tokenRef.current) {
      tokenRef.current = new placesLib.AutocompleteSessionToken();
    }
    return tokenRef.current;
  };

  const fetchGoogle = (q: string) => {
    if (!placesLib || q.trim().length < 2) {
      setGSug([]);
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
        setGSug(suggestions.filter((s) => s.placePrediction).slice(0, 5));
      } catch {
        setGSug([]);
      }
    })();
  };

  const onChange = (v: string) => {
    setQuery(v);
    invalidate();
    setOpen(true);
    setActive(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchGoogle(v), 300);
  };

  const savedMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? places.filter((p) => p.name.toLowerCase().includes(q))
      : places;
    return list.slice(0, 6);
  }, [places, query]);

  const exactSaved = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (places.find((p) => p.name.toLowerCase() === q) ?? null) : null;
  }, [places, query]);

  // ドロップダウンの行（フラット化。キーボード操作のため index で扱う）
  const rows: Row[] = useMemo(() => {
    const r: Row[] = savedMatches.map((p) => ({
      type: "saved",
      id: p.id,
      name: p.name,
    }));
    for (const s of gSug) r.push({ type: "google", sug: s });
    return r;
  }, [savedMatches, gSug]);

  const choose = (row: Row) => {
    if (row.type === "saved") {
      setResolved({ kind: "saved", id: row.id, name: row.name });
      setQuery(row.name);
      setGSug([]);
      setOpen(false);
      return;
    }
    // google: 詳細取得（セッショントークンは自動付与され、ここで課金）
    const pred = row.sug.placePrediction;
    if (!pred) return;
    const place = pred.toPlace();
    void (async () => {
      try {
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
        setResolved({
          kind: "google",
          placeId: place.id,
          name: place.displayName ?? pred.text.text,
          address: place.formattedAddress ?? "",
          lat: loc.lat(),
          lng: loc.lng(),
          ...extractRegion(place.addressComponents),
        });
        setQuery(place.displayName ?? pred.text.text);
      } finally {
        tokenRef.current = null; // セッション終了 → 次回は新トークン
        setGSug([]);
        setOpen(false);
      }
    })();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && rows[active]) {
        e.preventDefault();
        choose(rows[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // hidden input 値を (resolved, query) から導出。
  //  resolved 有 → それ。無 & 完全一致する保存済み有 → その保存済み。
  //  無 & テキスト有 → 自由入力。空 → 場所なし。
  let mode = "saved";
  let placeId = "";
  let placeLabel = "";
  let g = {
    id: "",
    name: "",
    address: "",
    lat: "",
    lng: "",
    region: "",
    locality: "",
  };
  if (resolved?.kind === "saved") {
    mode = "saved";
    placeId = resolved.id;
  } else if (resolved?.kind === "google") {
    mode = "google";
    g = {
      id: resolved.placeId,
      name: resolved.name,
      address: resolved.address,
      lat: String(resolved.lat),
      lng: String(resolved.lng),
      region: resolved.region ?? "",
      locality: resolved.locality ?? "",
    };
  } else if (!resolved && exactSaved && query.trim()) {
    mode = "saved";
    placeId = exactSaved.id;
  } else if (query.trim()) {
    mode = "free";
    placeLabel = query.trim();
  }

  return (
    <div ref={boxRef} className="relative mt-1">
      <input type="hidden" name="place_mode" value={mode} />
      <input type="hidden" name="place_id" value={placeId} />
      <input type="hidden" name="place_label" value={placeLabel} />
      <input type="hidden" name="g_place_id" value={g.id} />
      <input type="hidden" name="g_name" value={g.name} />
      <input type="hidden" name="g_address" value={g.address} />
      <input type="hidden" name="g_lat" value={g.lat} />
      <input type="hidden" name="g_lng" value={g.lng} />
      <input type="hidden" name="g_region" value={g.region} />
      <input type="hidden" name="g_locality" value={g.locality} />

      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className="block w-full min-w-0 rounded-md border border-foreground/20 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />

      {open && rows.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-foreground/10 bg-white shadow-lg">
          {rows.map((row, i) => {
            const isActive = i === active;
            const base = `block w-full px-2 py-1.5 text-left text-sm ${
              isActive ? "bg-foreground/10" : "hover:bg-foreground/10"
            }`;
            if (row.type === "saved") {
              return (
                <li key={`s-${row.id}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(row)}
                    className={base}
                  >
                    <span className="font-medium">{row.name}</span>
                    <span className="ml-2 text-xs text-subtle-foreground">
                      保存済み
                    </span>
                  </button>
                </li>
              );
            }
            const pred = row.sug.placePrediction!;
            return (
              <li key={`g-${pred.placeId ?? i}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(row)}
                  className={base}
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
    </div>
  );
}
