import {
  searchPlaces,
  type PlaceCandidate,
  type SearchPlacesOptions,
} from "./placesSearch";

// Google マップのアプリから「共有」された場所を、Google の場所（Place ID）に引く。
//
// 共有で渡ってくるのは短縮 URL（`https://maps.app.goo.gl/...`）で、店名の
// テキストが添えられることもある。短縮 URL を開いた先の URL には、
//   - `q`: 住所＋店名（「〒604-8847 京都府…２０−１ トラム」）
//   - `ftid`: Google マップの内部の識別子。後ろ半分が CID（各場所の番号）
// が入っている（実データで確認。座標は入っていなかった）。
//
// **CID から Place ID に変える公式の方法は無い**（Places API は Place ID でしか
// 引けない）ので、`q` で検索し、候補の Google マップの URL に入っている CID と
// 照らし合わせて選ぶ。一致が無ければ1件目（住所＋店名の検索なので、たいてい
// 1件目が当たる）。

// 共有されたテキストから Google マップの URL を1つ取り出す。
const MAPS_URL =
  /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)[^\s]*/i;

export function findGoogleMapsUrl(text: string): string | null {
  return MAPS_URL.exec(text)?.[0] ?? null;
}

// 開く前の短縮 URL か（開いて行き先の URL を得る必要があるか）。
export function isShortMapsUrl(url: string): boolean {
  return /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(url);
}

export type MapsLocator = {
  // 検索に使う文字列（住所＋店名、または店名）。
  query: string | null;
  // Google マップの各場所の番号（10進の文字列）。照らし合わせに使う。
  cid: string | null;
  // URL に座標が入っていた時だけ（`@lat,lng` や `q=lat,lng`）。
  coords: { lat: number; lng: number } | null;
};

// 開いた後の Google マップの URL から、場所を引く手がかりを取り出す。
export function parseGoogleMapsUrl(url: string): MapsLocator {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { query: null, cid: null, coords: null };
  }
  const p = u.searchParams;

  let cid = p.get("cid");
  const ftid = p.get("ftid") ?? /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(url)?.[1];
  if (!cid && ftid) cid = cidFromFtid(ftid);

  let query = p.get("q") ?? p.get("query");
  let coords: MapsLocator["coords"] = null;
  if (query && LAT_LNG.test(query)) {
    coords = latLng(query);
    query = null;
  }
  // /maps/place/<名前>/@lat,lng,... の形（ブラウザ版の共有など）。
  const place = /\/maps\/place\/([^/]+)/.exec(u.pathname);
  if (!query && place) query = decodeURIComponent(place[1].replace(/\+/g, " "));
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(u.pathname);
  if (!coords && at) coords = { lat: Number(at[1]), lng: Number(at[2]) };

  return { query: query?.trim() || null, cid: cid || null, coords };
}

const LAT_LNG = /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/;

function latLng(s: string): { lat: number; lng: number } {
  const [lat, lng] = s.split(",").map((x) => Number(x.trim()));
  return { lat, lng };
}

// ftid（`0x6001079cb848aa3f:0xbe53753039dde7a0`）の後ろ半分が CID。
export function cidFromFtid(ftid: string): string | null {
  const second = ftid.split(":")[1];
  if (!second || !/^0x[0-9a-f]+$/i.test(second)) return null;
  return BigInt(second).toString();
}

// Places API の googleMapsUri（`https://maps.google.com/?cid=…&g_mp=…`）の CID。
export function cidOfMapsUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    return new URL(uri).searchParams.get("cid");
  } catch {
    return null;
  }
}

// 候補から CID の一致するものを選ぶ。無ければ1件目。
export function pickByCid<T extends { googleMapsUri?: string | null }>(
  candidates: T[],
  cid: string | null,
): T | null {
  if (cid) {
    const hit = candidates.find((c) => cidOfMapsUri(c.googleMapsUri) === cid);
    if (hit) return hit;
  }
  return candidates[0] ?? null;
}

// 共有されたテキストから Google の場所を引く（アプリの共有の受け口が使う）。
// 引けなければ null（Google マップの URL が無い・検索で何も出ない）。
export async function resolveGoogleMapsShare(
  text: string,
  opts: Omit<SearchPlacesOptions, "withMapsUri">,
): Promise<PlaceCandidate | null> {
  const found = findGoogleMapsUrl(text);
  if (!found) return null;
  // 短縮 URL は開いて行き先の URL を得る（fetch はリダイレクトを辿り、
  // 最後の URL を response.url に残す）。中身は読まないので HEAD で済ませる。
  const url = isShortMapsUrl(found)
    ? (await fetch(found, { method: "HEAD" })).url || found
    : found;
  const loc = parseGoogleMapsUrl(url);
  if (!loc.query) return null;
  const candidates = await searchPlaces(loc.query, {
    ...opts,
    withMapsUri: true,
    // 座標が分かっていればその近くを優先する（店名だけの検索の取り違えを防ぐ）。
    ...(loc.coords && !opts.biasCenter ? { biasCenter: loc.coords } : {}),
    // 住所＋店名で引くので、旅程の居場所によるバイアスが無くても探してよい。
    allowUnbiased: true,
  });
  return pickByCid(candidates, loc.cid);
}
