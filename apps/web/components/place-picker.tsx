"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useTranslations } from "next-intl";
import { Combobox } from "@base-ui/react/combobox";

import type { LatLng } from "@triplot/shared/placeMap";

import { inputClass } from "./input-class";
import { extractRegion } from "./place-search";
import { menuItemClass } from "./menu-item";
import { matchPlace } from "@triplot/shared/import/placeMatch";

// 取り込みの自動解決で「Google の場所に丸める」最低スコア。高すぎると近い候補も丸まらないので
// 0.6（候補は上位複数をスコアして最良を採るので、ほどほどで誤丸めしにくい）。実データで調整可。
const AUTO_ROUND_THRESHOLD = 0.6;

type PlacesLib = google.maps.PlacesLibrary;

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
      icon: string | null;
    };

// Google Autocomplete で 1 回だけ検索→スコアリング→高確信なら Place Details まで取得する。
// 閾値未満/候補無しは null（呼び出し側が別の検索語でリトライするかテキストのまま留める）。
async function tryResolvePlace(
  placesLib: PlacesLib,
  sessionToken: google.maps.places.AutocompleteSessionToken,
  input: string,
  location: string | null,
  biasCenter: LatLng,
): Promise<{ resolved: Resolved; name: string } | null> {
  const { suggestions } =
    await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input,
      language: "ja",
      region: "jp",
      sessionToken,
      locationBias: { center: biasCenter, radius: 30000 },
    });
  // 先頭だけでなく上位候補をスコアして最良を採る（正しい場所が #1 とは限らないため）。
  // スコアは prediction の表示名(mainText)＋住所(secondaryText)で計算（詳細取得は勝者だけ）。
  const preds = suggestions
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .slice(0, 5);
  let bestPred: (typeof preds)[number] | null = null;
  let bestScore = -1;
  for (const p of preds) {
    const name = p.mainText?.text ?? p.text.text;
    const addr = p.secondaryText?.text ?? "";
    const r = matchPlace(
      { merchant: input, location },
      [{ id: "g", name, formattedAddress: addr }],
      0,
    );
    const score = r?.score ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestPred = p;
    }
  }
  if (!bestPred || bestScore < AUTO_ROUND_THRESHOLD) return null;
  const place = bestPred.toPlace();
  await place.fetchFields({
    fields: ["id", "displayName", "formattedAddress", "addressComponents", "location"],
  });
  const loc = place.location;
  if (!place.id || !loc) return null;
  const candName = place.displayName ?? bestPred.text.text;
  return {
    resolved: {
      kind: "google",
      placeId: place.id,
      name: candName,
      address: place.formattedAddress ?? "",
      lat: loc.lat(),
      lng: loc.lng(),
      icon: null,
      ...extractRegion(place.addressComponents),
    },
    name: candName,
  };
}

// 1 つの入力欄に「保存済みの場所」「Google サジェスト」「自由入力」を
// 混ぜて出すコンボボックス（Google カレンダーの場所欄や Notion/Linear の作成サジェスト同系）。
// 殻（入力欄＋候補リスト＋キーボード操作＋開閉＋外側クリック＋a11y）は Base UI Combobox に委ね、
// 「保存済み/Google/自由入力」の解決・Google 非同期取得・hidden input 導出は従来どおり自前。
//
// 区別の付け方:
//  - ドロップダウンから保存済み行を選ぶ      → place_id 連携
//  - ドロップダウンから Google 行を選ぶ      → 確定で places 作成＋連携
//  - 何も選ばず入力テキストのまま確定        → 自由入力（place_label）
//  - 入力が保存済みの名前と完全一致           → その保存済みへ自動解決
//
// サーバ契約（place_mode / place_id / place_label / g_*）は据え置きで、
// hidden input をこのコンポーネントが状態から組み立てる。

// 自由入力も Model B で place_id に解決済みなので、編集時の初期値は
// 常に保存済み（saved）か無し。"free" は取り込み確定など、確定前から
// 自由入力テキストを事前入力したい（かつ Google 自動解決はしたくない）
// 場合だけに使う特殊な初期値（例: transit の便名は実在の場所ではないので
// Google 検索の対象にしない）。"google" は呼び出し側が既に Google の
// place_id を解決済み（メール取り込みの空港解決・フライト番号確定）の時の
// 初期値。ドロップダウンから Google 行を選んだのと同じ確定済み状態で開始する
// （再検索はしない。文字を編集したら "free" 相当に戻って落ちる）。
export type PlacePickerInitial =
  | { kind: "saved"; id: string; name: string }
  // 自由入力でも座標が分かっていることがある（フライトから入れた空港）。
  // 文字を編集したら別の場所になったとみなして座標は落とす。
  | {
      kind: "free";
      label: string;
      coords?: { lat: number; lng: number } | null;
      icon?: string | null;
    }
  | {
      kind: "google";
      placeId: string;
      name: string;
      address: string;
      lat: number;
      lng: number;
      region: string | null;
      locality: string | null;
      icon: string | null;
    }
  | null;

type Row =
  | { type: "saved"; id: string; name: string }
  | { type: "google"; sug: google.maps.places.AutocompleteSuggestion };

export function PlacePicker({
  namePrefix = "",
  onCoordsChange,
  places,
  biasCenter,
  initial,
  placeholder,
  autoResolve,
}: {
  // hidden input の名前の接頭辞。1画面に場所欄が複数あるとき（予定の出発地/
  // 到着地）に衝突を避ける。既定は空＝従来の名前のまま。
  namePrefix?: string;
  // 選択された場所の座標を親に知らせる。予定フォームが移動の TZ を場所から
  // 導出するのに使う（この部品自体は非制御なので、必要な値だけ外へ出す）。
  onCoordsChange?: (coords: { lat: number; lng: number } | null) => void;
  places: { id: string; name: string }[];
  biasCenter: LatLng;
  initial: PlacePickerInitial;
  // ラベルは置かない規約なので placeholder＝フィールド名（場所）を呼び出し側が渡す。
  placeholder: string;
  // 取り込み用: 開いた時にこの店名を Google で自動解決し、高確信なら Google の場所に丸める
  // （低確信なら name のままテキスト場所）。initial（保存済みマッチ）が有る時は無視。
  // searchQuery を渡すと Google への検索語だけを差し替えられる（表示・低確信時の
  // フォールバックは常に name）。例: 空港名はそのまま表示・フォールバックにしつつ、
  // 検索だけ「空港名 ターミナル」を試して高確信ならターミナル単位の場所に丸め、
  // 低確信なら素の空港名に留める。
  autoResolve?: {
    name: string;
    location?: string | null;
    searchQuery?: string;
  } | null;
}) {
  const t = useTranslations("place");
  const placesLib = useMapsLibrary("places");

  const [query, setQuery] = useState(
    initial?.kind === "saved"
      ? initial.name
      : initial?.kind === "google"
        ? initial.name
        : initial?.kind === "free"
          ? initial.label
          : (autoResolve?.name ?? ""),
  );
  const [resolved, setResolved] = useState<Resolved | null>(
    initial?.kind === "saved"
      ? { kind: "saved", id: initial.id, name: initial.name }
      : initial?.kind === "google"
        ? {
            kind: "google",
            placeId: initial.placeId,
            name: initial.name,
            address: initial.address,
            lat: initial.lat,
            lng: initial.lng,
            region: initial.region,
            locality: initial.locality,
            icon: initial.icon,
          }
        : null,
  );
  const [gSug, setGSug] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  // 自由入力に付随する座標（フライトから入れた空港）。文字を編集したら
  // 別の場所を指し始めたとみなして落とす。
  const initialFree = initial?.kind === "free" ? initial : null;
  const freeLat = initialFree?.coords?.lat ?? null;
  const freeLng = initialFree?.coords?.lng ?? null;

  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 自動解決は1マウント1回だけ（毎レンダー走らないように）。フォームを開き直すと remount=再実行。
  const autoResolveTried = useRef(false);

  // 候補リストの開閉。Base UI に任せると（特に iOS のボトムシート内で）キーボードを
  // 閉じても候補が残るので、controlled にして「キーボードが閉じたら閉じる」を足す。
  const [open, setOpen] = useState(false);

  // 解決済みの場所の座標を親へ。保存済みの場所は places から座標を引く
  // （Google 由来は resolved 自身が持っている）。
  useEffect(() => {
    if (!onCoordsChange) return;
    if (!resolved) {
      // 自由入力でも座標を持つことがある（フライトから入れた空港）。TZ の導出に
      // 使えるので親へ渡す。依存はプリミティブで持つ（オブジェクトを依存に置くと
      // 親が毎レンダー新しい initial を作る構造と噛み合って無限ループになる）。
      onCoordsChange(
        freeLat != null && freeLng != null ? { lat: freeLat, lng: freeLng } : null,
      );
      return;
    }
    if (resolved.kind === "google") {
      onCoordsChange({ lat: resolved.lat, lng: resolved.lng });
      return;
    }
    const hit = places.find((p) => p.id === resolved.id) as
      | { lat?: number | null; lng?: number | null }
      | undefined;
    onCoordsChange(
      hit && hit.lat != null && hit.lng != null
        ? { lat: hit.lat, lng: hit.lng }
        : null,
    );
  }, [resolved, places, onCoordsChange, freeLat, freeLng]);

  // 入力を編集したら確定済み選択は無効化（= 自由入力候補に戻る）。
  const invalidate = () => setResolved(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ソフトウェアキーボードが閉じたら候補も閉じる。visualViewport の高さが大きく戻った＝
  // キーボードが下がった、と判定（vaul と同じ 60px 閾値）。
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let prevHeight = vv.height;
    const onResize = () => {
      const grew = vv.height - prevHeight > 60;
      prevHeight = vv.height;
      if (grew) setOpen(false);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  const ensureToken = () => {
    if (!placesLib) return undefined;
    if (!tokenRef.current) {
      tokenRef.current = new placesLib.AutocompleteSessionToken();
    }
    return tokenRef.current;
  };

  // 取り込みの自動解決：開いた時に店名/場所名を Google 補完→自前スコアで判定し、高確信なら
  // Google の場所に丸める（座標付き＝ピン）。低確信/候補無しはテキストのまま（query は初期値の
  // name が入っているのでテキスト場所になる）。initial（保存済み）が有る時は何もしない。
  // searchQuery があれば先にそれで試し（例: 空港名+ターミナル）、閾値未満なら素の name に
  // フォールバックする＝「ターミナル単位に丸まらないなら空港には丸める」の2段階（ターミナルに
  // 固執して丸め自体を諦めない）。同一セッショントークンで両方試すので課金は1セッション分のまま。
  useEffect(() => {
    if (autoResolveTried.current) return;
    if (initial) return;
    const merchant = autoResolve?.name?.trim();
    if (!merchant) return;
    if (!placesLib) return; // placesLib が来るまで待つ（来たら再実行）
    autoResolveTried.current = true;
    const location = autoResolve?.location ?? null;
    const searchQuery = autoResolve?.searchQuery?.trim() || null;
    const attempts =
      searchQuery && searchQuery !== merchant
        ? [searchQuery, merchant]
        : [merchant];
    void (async () => {
      if (!tokenRef.current) {
        tokenRef.current = new placesLib.AutocompleteSessionToken();
      }
      const sessionToken = tokenRef.current;
      try {
        for (const input of attempts) {
          const found = await tryResolvePlace(
            placesLib,
            sessionToken,
            input,
            location,
            biasCenter,
          );
          if (found) {
            setResolved(found.resolved);
            setQuery(found.name);
            return;
          }
        }
        // どちらも閾値未満 → テキスト場所のまま（query は初期値の name のまま）。
      } catch {
        // 取得失敗 → テキストのまま。
      } finally {
        tokenRef.current = null; // セッション終了
      }
    })();
  }, [placesLib, initial, autoResolve, biasCenter]);

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

  // 入力テキストが変わった（タイピング）時。確定を無効化＋デバウンスで Google 取得。
  const onType = (v: string) => {
    setQuery(v);
    invalidate();
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

  // ドロップダウンの行（保存済み → Google の順でフラット化）。
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
          icon: null,
          ...extractRegion(place.addressComponents),
        });
        setQuery(place.displayName ?? pred.text.text);
      } finally {
        tokenRef.current = null; // セッション終了 → 次回は新トークン
        setGSug([]);
      }
    })();
  };

  const rowLabel = (row: Row) =>
    row.type === "saved"
      ? row.name
      : (row.sug.placePrediction?.mainText?.text ??
        row.sug.placePrediction?.text.text ??
        "");

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
    icon: "",
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
      icon: resolved.icon ?? "",
    };
  } else if (!resolved && exactSaved && query.trim()) {
    mode = "saved";
    placeId = exactSaved.id;
  } else if (query.trim()) {
    mode = "free";
    placeLabel = query.trim();
  }
  // 座標は「自由入力のまま・文字も変えていない」ときだけ通す。
  const freeCoords =
    mode === "free" && initialFree?.coords && query.trim() === initialFree.label
      ? { coords: initialFree.coords, icon: initialFree.icon ?? null }
      : null;

  return (
    <div className="relative mt-1">
      <input type="hidden" name={`${namePrefix}place_mode`} value={mode} />
      <input type="hidden" name={`${namePrefix}place_id`} value={placeId} />
      <input type="hidden" name={`${namePrefix}place_label`} value={placeLabel} />
      <input
        type="hidden"
        name={`${namePrefix}place_lat`}
        value={freeCoords ? String(freeCoords.coords.lat) : ""}
      />
      <input
        type="hidden"
        name={`${namePrefix}place_lng`}
        value={freeCoords ? String(freeCoords.coords.lng) : ""}
      />
      <input
        type="hidden"
        name={`${namePrefix}place_icon`}
        value={freeCoords?.icon ?? ""}
      />
      <input type="hidden" name={`${namePrefix}g_place_id`} value={g.id} />
      <input type="hidden" name={`${namePrefix}g_name`} value={g.name} />
      <input type="hidden" name={`${namePrefix}g_address`} value={g.address} />
      <input type="hidden" name={`${namePrefix}g_lat`} value={g.lat} />
      <input type="hidden" name={`${namePrefix}g_lng`} value={g.lng} />
      <input type="hidden" name={`${namePrefix}g_region`} value={g.region} />
      <input type="hidden" name={`${namePrefix}g_locality`} value={g.locality} />
      <input type="hidden" name={`${namePrefix}g_icon`} value={g.icon} />

      <Combobox.Root
        items={rows}
        // 開閉は controlled（Base UI の判断をそのまま反映しつつ、キーボード閉じでも閉じる）。
        open={open}
        onOpenChange={setOpen}
        // 候補は自前で用意（保存済み絞り込み＋Google 非同期）。内部フィルタは無効化。
        filter={null}
        itemToStringLabel={rowLabel}
        // 入力テキストは query で制御。タイピング時だけ onType（選択時の自動入力は無視）。
        inputValue={query}
        onInputValueChange={(value, details) => {
          if (details.reason === "input-change") onType(value);
        }}
        // 行の選択（クリック/Enter）→ row オブジェクトを受けて解決。
        onValueChange={(row) => {
          if (row) choose(row as Row);
        }}
      >
        <Combobox.Input
          placeholder={placeholder}
          autoComplete="off"
          className={`block w-full min-w-0 ${inputClass}`}
        />
        <Combobox.Portal>
          {/* z-[60]: この入力は予定/費用フォーム＝FormPopover（ポップオーバー z-50 /
              Vaul シート z-50）の中に置かれる。候補は body へ portal されるので、
              その器より上に出さないと裏に隠れる（place-search は地図上で単独なので
              z-20 で足りるが、こちらは重なりの上に出す必要がある）。 */}
          <Combobox.Positioner sideOffset={4} className="z-[60]">
            <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-md border border-foreground/10 bg-background shadow-lg">
              <Combobox.List>
                {(row: Row) => (
                  <Combobox.Item
                    key={
                      row.type === "saved"
                        ? `s-${row.id}`
                        : `g-${row.sug.placePrediction?.placeId ?? rowLabel(row)}`
                    }
                    value={row}
                    className={`block ${menuItemClass} data-[highlighted]:bg-foreground/10`}
                  >
                    {row.type === "saved" ? (
                      <>
                        <span className="font-medium">{row.name}</span>
                        <span className="ml-2 text-xs text-subtle-foreground">
                          {t("savedBadge")}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium">
                          {row.sug.placePrediction!.mainText?.text ??
                            row.sug.placePrediction!.text.text}
                        </span>
                        {row.sug.placePrediction!.secondaryText?.text && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.sug.placePrediction!.secondaryText.text}
                          </span>
                        )}
                      </>
                    )}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}
