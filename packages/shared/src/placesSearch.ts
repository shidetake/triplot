import type { CreatePlaceInput } from "./data/places";
import type { PlaceInput } from "./data/place";

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
};

type AddressComponent = { types: string[]; longText?: string | null };

// Google の住所成分から region(州/県) と locality(市) を取り出す。
// web（place-search.tsx の extractRegion）と同じ規則。REST の addressComponents も
// { types, longText } の形なので共通。
export function extractRegion(components: AddressComponent[] | null | undefined): {
  region: string | null;
  locality: string | null;
} {
  const pick = (type: string) =>
    components?.find((c) => c.types.includes(type))?.longText ?? null;
  return {
    region: pick("administrative_area_level_1"),
    locality: pick("locality") ?? pick("sublocality_level_1"),
  };
}

export type SearchPlacesOptions = {
  apiKey: string;
  // iOS アプリ制限つき API キーは X-Ios-Bundle-Identifier ヘッダが要る。
  iosBundleId?: string;
  // 地理バイアス（既存ピンの重心 or 東京）。半径は 50km 固定。
  biasCenter?: { lat: number; lng: number };
  languageCode?: string;
  regionCode?: string;
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
        radius: 50000,
      },
    };
  }

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
      };
    });
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
