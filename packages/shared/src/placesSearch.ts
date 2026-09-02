import type { FlightEndpoint } from "./flight";
import type { CreatePlaceInput } from "./data/places";
import type { PlaceInput } from "./data/place";
import { matchPlace } from "./import/placeMatch";

// Places API (New) を素の fetch で叩く（RN 用。web は JS SDK の
// Place.searchByText を使うが、抽出後の形はこの PlaceCandidate に揃える）。
// API キーと bundle ID はプラットフォーム側から注入する（将来 Android でも共用）。

export type PlaceCandidate = {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  // 地図のクラスタチップ用。region=都道府県/州、locality=市。
  region: string | null;
  locality: string | null;
  rating: number | null;
  userRatingCount: number | null;
  // Google の主カテゴリ（restaurant / cafe / hotel …）。候補ピンのグリフ用。
  primaryType: string | null;
};

// types は Google の応答で欠けることがある（実機で TypeError になった実データあり）。
type AddressComponent = { types?: string[] | null; longText?: string | null };

// Google の住所成分から region(州/県) と locality(市) を取り出す。
// web（place-search.tsx の extractRegion）と同じ規則。REST の addressComponents も
// { types, longText } の形なので共通。
export function extractRegion(components: AddressComponent[] | null | undefined): {
  region: string | null;
  locality: string | null;
} {
  const pick = (type: string) =>
    components?.find((c) => c.types?.includes(type))?.longText ?? null;
  return {
    region: pick("administrative_area_level_1"),
    locality: pick("locality") ?? pick("sublocality_level_1"),
  };
}

export type SearchPlacesOptions = {
  apiKey: string;
  // iOS アプリ制限つき API キーは X-Ios-Bundle-Identifier ヘッダが要る。
  iosBundleId?: string;
  // 地理バイアス（既存ピンの重心 or 東京）。
  biasCenter?: { lat: number; lng: number };
  // biasCenter の半径。既定 50km（トリップ全体を見渡す通常検索向け）。
  biasRadiusMeters?: number;
  languageCode?: string;
  regionCode?: string;
  // 結果をこの Place Type だけに絞る（例: "airport"）。指定しなければ絞らない。
  includedType?: string;
  // 住所もバイアスも無いまま解決してよい。呼び出し側が「この名前は固有名だ」と
  // 分かっている時だけ立てる（移動の乗降地＝駅・空港・港）。
  allowUnbiased?: boolean;
};

// Places API (New): places:searchText。FieldMask は最小限（住所成分まで）。
export async function searchPlaces(
  query: string,
  opts: SearchPlacesOptions,
): Promise<PlaceCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": opts.apiKey,
    "X-Goog-FieldMask": [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.addressComponents",
      "places.rating",
      "places.userRatingCount",
      "places.primaryType",
    ].join(","),
  };
  if (opts.iosBundleId) {
    headers["X-Ios-Bundle-Identifier"] = opts.iosBundleId;
  }

  const body: Record<string, unknown> = {
    textQuery: trimmed,
    languageCode: opts.languageCode ?? "ja",
    regionCode: opts.regionCode ?? "jp",
  };
  if (opts.biasCenter) {
    body.locationBias = {
      circle: {
        center: {
          latitude: opts.biasCenter.lat,
          longitude: opts.biasCenter.lng,
        },
        radius: opts.biasRadiusMeters ?? 50000,
      },
    };
  }
  if (opts.includedType) body.includedType = opts.includedType;

  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    { method: "POST", headers, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Places searchText ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    places?: {
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
      addressComponents?: AddressComponent[];
      rating?: number;
      userRatingCount?: number;
      primaryType?: string;
    }[];
  };

  return (json.places ?? [])
    .filter((p) => p.location)
    .map((p) => {
      const { region, locality } = extractRegion(p.addressComponents);
      return {
        placeId: p.id,
        name: p.displayName?.text ?? "",
        formattedAddress: p.formattedAddress ?? "",
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        region,
        locality,
        rating: p.rating ?? null,
        userRatingCount: p.userRatingCount ?? null,
        primaryType: p.primaryType ?? null,
      };
    });
}

// 検索バーの入力中サジェスト1件（web の AutocompleteSuggestion 相当）。
// placeId は確定時に fetchPlaceDetails で詳細を引くための ID。
export type PlacePrediction = {
  placeId: string;
  // 主表記（店名）と副表記（住所）。web の structuredFormat と同じ2段。
  primaryText: string;
  secondaryText: string;
};

// Places API (New): places:autocomplete。入力中サジェスト（web の
// AutocompleteSuggestion.fetchAutocompleteSuggestions と同じ役割）。session
// トークンで autocomplete 群 + 確定時の details を1セッションに束ねて課金最適化
// （web も sessionToken を使う。呼び出し側が debounce する）。
export async function autocompletePlaces(
  input: string,
  opts: SearchPlacesOptions & { sessionToken?: string },
): Promise<PlacePrediction[]> {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": opts.apiKey,
  };
  if (opts.iosBundleId) {
    headers["X-Ios-Bundle-Identifier"] = opts.iosBundleId;
  }

  const body: Record<string, unknown> = {
    input: trimmed,
    languageCode: opts.languageCode ?? "ja",
    regionCode: opts.regionCode ?? "jp",
  };
  if (opts.sessionToken) body.sessionToken = opts.sessionToken;
  if (opts.biasCenter) {
    body.locationBias = {
      circle: {
        center: {
          latitude: opts.biasCenter.lat,
          longitude: opts.biasCenter.lng,
        },
        radius: 30000,
      },
    };
  }

  const res = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    { method: "POST", headers, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Places autocomplete ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId: string;
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
        text?: { text?: string };
      };
    }[];
  };

  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .slice(0, 6)
    .map((p) => ({
      placeId: p.placeId,
      primaryText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
    }));
}

// Places API (New): 単一の場所の詳細（地図の POI タップから保存する時と、
// autocomplete サジェストの確定時に使う。住所・region を補完する）。
export async function fetchPlaceDetails(
  placeId: string,
  opts: SearchPlacesOptions & { sessionToken?: string },
): Promise<PlaceCandidate | null> {
  const headers: Record<string, string> = {
    "X-Goog-Api-Key": opts.apiKey,
    "X-Goog-FieldMask": [
      "id",
      "displayName",
      "formattedAddress",
      "location",
      "addressComponents",
      "rating",
      "userRatingCount",
      "primaryType",
    ].join(","),
  };
  if (opts.iosBundleId) {
    headers["X-Ios-Bundle-Identifier"] = opts.iosBundleId;
  }
  const lang = opts.languageCode ?? "ja";
  // sessionToken を渡すと直前の autocomplete 群と1セッションで課金される
  // （web の fetchFields と同じ。details は token を消費してセッションを閉じる）。
  const tokenParam = opts.sessionToken
    ? `&sessionToken=${encodeURIComponent(opts.sessionToken)}`
    : "";
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${lang}${tokenParam}`,
    { headers },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Places details ${res.status}: ${text}`);
  }
  const p = (await res.json()) as {
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    addressComponents?: AddressComponent[];
    rating?: number;
    userRatingCount?: number;
    primaryType?: string;
  };
  if (!p.location) return null;
  const { region, locality } = extractRegion(p.addressComponents);
  return {
    placeId: p.id,
    name: p.displayName?.text ?? "",
    formattedAddress: p.formattedAddress ?? "",
    lat: p.location.latitude,
    lng: p.location.longitude,
    region,
    locality,
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
    primaryType: p.primaryType ?? null,
  };
}

// 候補 → 場所欄の3モードの google（予定・費用フォームで使う）。
export function candidateToPlaceInput(c: PlaceCandidate): PlaceInput {
  return {
    kind: "google",
    placeId: c.placeId,
    name: c.name,
    address: c.formattedAddress,
    lat: c.lat,
    lng: c.lng,
    region: c.region,
    locality: c.locality,
  };
}

// 候補 → 場所の新規作成（地図タブでピンを保存するとき）。
export function candidateToCreatePlace(
  c: PlaceCandidate,
  opts: { tentative: boolean; visibility: "shared" | "private"; icon: string },
): CreatePlaceInput {
  return {
    name: c.name,
    tentative: opts.tentative,
    visibility: opts.visibility,
    note: "",
    googlePlaceId: c.placeId,
    lat: c.lat,
    lng: c.lng,
    formattedAddress: c.formattedAddress,
    icon: opts.icon,
    region: c.region ?? "",
    locality: c.locality ?? "",
  };
}

// ────────────────────────────────────────────────
// 空港（座標が既に分かっている場所）の Google 解決
// ────────────────────────────────────────────────
//
// フライト提供元（AeroDataBox）は空港名・座標を返すが Google の place_id は
// 知らない。メール取り込みの事前解決と手動のフライト番号確定の両方で、同じ
// 空港が表記違い（"Tokyo Narita" / "成田国際空港"）で別々の場所として登録
// されてしまう問題への対応。座標を既に知っているので、レシート店名の自動
// 解決（matchPlace のテキスト類似度）とは違い、**候補が座標的に十分近いか**
// で確信度を判定する。

const AIRPORT_MATCH_MAX_METERS = 5000;

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * 検索結果の先頭候補が、既知の座標から AIRPORT_MATCH_MAX_METERS 以内なら
 * 採用する。離れていれば別物とみなし null（提供元が違う空港の中心点を返す
 * ズレは吸収しつつ、無関係な場所との誤マッチは避ける閾値）。
 */
export function nearestCandidate(
  candidates: readonly PlaceCandidate[],
  coords: { lat: number; lng: number },
): PlaceCandidate | null {
  const top = candidates[0];
  if (!top) return null;
  return haversineMeters(top, coords) <= AIRPORT_MATCH_MAX_METERS ? top : null;
}

/**
 * フライトの空港エンドポイントを Google の場所に解決する。座標が無い・
 * 検索失敗・十分近い候補が無いときは null（呼び出し側は座標つき自由入力に
 * フォールバックする＝機能の前提ではなく表示上の改善）。
 */
export async function resolveAirportPlace(
  endpoint: FlightEndpoint,
  opts: SearchPlacesOptions,
): Promise<PlaceCandidate | null> {
  if (endpoint.lat === null || endpoint.lng === null) return null;
  const coords = { lat: endpoint.lat, lng: endpoint.lng };
  try {
    // includedType="airport" で絞る: 提供元の空港名がその都市名だけ（例:
    // "Honolulu"）のことがあり、テキストの一致度だけでは同名の市街地が
    // 先に返って空港自体が見つからないことがある（実機フィードバック）。
    // 種別を空港に絞れば、多少あいまいな名前でも地理バイアス内の実際の
    // 空港を確実に拾える。半径も 20km に絞り、無関係な空港との誤マッチを防ぐ。
    const candidates = await searchPlaces(endpoint.name, {
      ...opts,
      biasCenter: coords,
      biasRadiusMeters: 20000,
      includedType: "airport",
    });
    return nearestCandidate(candidates, coords);
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────
// 店名・場所名（座標未知）の Google 解決
// ────────────────────────────────────────────────
//
// レストラン・ショップ等はフライトの空港と違い座標を最初から知らないので、
// resolveAirportPlace のような座標距離での確信度判定ができない。代わりに
// web の PlacePicker autoResolve（tryResolvePlace）と同じ「店名のテキスト
// 一致度」（matchPlace）で判定する。matchPlace は保存済み場所とのマッチにも
// 使う純関数で、Google 候補を仮の TripPlace として渡せば同じスコアリングが
// 使える。

// 抽出された名前の言語。日本語の文字が1つでもあれば "ja"、無ければ "en"。
// 混在（「Yard House 品川店」）は日本語側に寄せる — Google が日本語で返す
// 名前の方が元の表記に近い。
export function queryLanguageFor(name: string): "ja" | "en" {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(name)
    ? "ja"
    : "en";
}

const NAMED_PLACE_MATCH_THRESHOLD = 0.6;

/**
 * 店名・場所名を Google の場所に解決する。ある程度広い地理バイアス
 * （旅行のピンの重心等、呼び出し側が用意する）の中から上位候補をスコアし、
 * 閾値未満/候補無しは null（呼び出し側は自由入力のままにする＝機能の前提
 * ではなく表示上の改善）。
 */
export async function resolveNamedPlace(
  name: string,
  // 住所（分かっている時だけ）。名前と住所を別々に持つのは、**住所があるかを
  // 確実に知るため**。1つの文字列に混ぜると「住所が入っているか」を長さの比率
  // などで当てるしかなく不安定だった。
  address: string | null,
  opts: SearchPlacesOptions,
): Promise<PlaceCandidate | null> {
  const trimmed = name.trim();
  const addr = address?.trim() || null;
  if (!trimmed) return null;
  // **住所があれば地理バイアスは要らない。** 実測: "Island Vintage Wine Bar,
  // 2301 Kalakaua Avenue, Honolulu, HI 96815" はバイアス無しでも正しい店に
  // 解決する。逆に住所の無い "HITEA CAFE" をバイアス無しで引くと京都の店が
  // 返るので、その場合はバイアスを必須のままにする。
  //
  // これが無いと「解決できない → 座標なしの場所ができる → バイアスが作れない」
  // の循環から抜け出せない（実機で、旅行の場所3件すべてが座標なしになっていた）。
  // 例外は、駅・空港・港のような**固有名だと呼び出し側が分かっている**場合
  // （移動の乗降地）。実測: 「品川駅」「京都駅」はバイアス無しでも一意に決まる。
  // 旅行の地理バイアスは目的地（ハワイ等）にあるので、国内の駅はむしろ
  // バイアスがあると引けない。
  if (!addr && !opts.biasCenter && !opts.allowUnbiased) return null;
  try {
    // searchPlaces の既定 languageCode は "ja"（RN の場所検索 UI 向け）だが、
    // merchant/location はメール本文からそのままの言語（英語のレシートが
    // 多い）で抽出される。日本語名で返ってくると matchPlace のテキスト
    // 一致度が実質ゼロになり、実在の正しい候補でも閾値未満で弾いてしまう
    // （実機フィードバック: "Yard House" ⇔ "ヤード ハウス" で不一致）。
    // **応答の言語は抽出された名前の言語に合わせる**（英語固定にしない）。
    // 名前は元のメールの言語で出てくるので、英語のレシートは英語、日本語の
    // メールは日本語で返させる。揃っていないと逆向きに同じことが起きる
    // （実測: 「品川駅」を英語で引くと "Shinagawa Station" が返り、一致度が
    // 閾値に届かず null。空港も駅も同様に全滅していた）。
    // 検索語は名前と住所を繋げる（併記が一番一意に決まるのは実測済み）。
    // 分けて持つのは「住所があるか」を確実に知るためで、問い合わせ方は変えない。
    const query = addr ? `${trimmed}, ${addr}` : trimmed;
    const candidates = await searchPlaces(query, {
      ...opts,
      languageCode: queryLanguageFor(trimmed),
    });
    let best: PlaceCandidate | null = null;
    let bestScore = -1;
    for (const c of candidates.slice(0, 5)) {
      const r = matchPlace(
        { name: trimmed, address: addr },
        [{ id: c.placeId, name: c.name, formattedAddress: c.formattedAddress }],
        0,
      );
      const score = r?.score ?? 0;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best && bestScore >= NAMED_PLACE_MATCH_THRESHOLD ? best : null;
  } catch {
    return null;
  }
}
