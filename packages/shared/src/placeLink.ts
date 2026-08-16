// 場所を Google マップで開くための URL（DB を触らない純粋関数）。
// web はリンクの href に、RN は Linking.openURL に渡す（iOS では Google マップ
// アプリが入っていればそちらが開く）。

export type GmapsLinkPlace = {
  name: string;
  google_place_id: string | null;
  lat: number | null;
  lng: number | null;
};

export function gmapsUrl(p: GmapsLinkPlace): string {
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
