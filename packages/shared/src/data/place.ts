// 場所欄の3モード（予定・費用で共有する解決契約。同じ PlacePicker・同じ wire）。
// saved=保存済み or 無し、free=フリーテキスト、google=サジェスト確定（places に確定作成）。
//
// free は「Google 以外の出所で名前が分かっている場所」。座標まで分かっている
// ことがある（フライトの空港＝提供元が緯度経度を返す）ので、任意で持てる。
// 付いていれば地図にピンが立ち、訪問順の並べ替えでも座標つきとして扱われる。
export type PlaceInput =
  | { kind: "saved"; placeId: string | null }
  | {
      kind: "free";
      label: string | null;
      coords?: { lat: number; lng: number } | null;
      /** places.icon（placeIcons のキー）。既定は "pin" */
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
      /** places.icon（placeIcons のキー）。省略時は DB 側の既定 "pin"
       *  （空港解決〔resolveAirportPlace〕など、呼び出し側が種別を知っている
       *  時だけ明示する。Google の検索結果から選んだ通常のケースでは省略）。 */
      icon?: string | null;
    };

// PlaceInput を DB の「場所指定（place spec）」に変換する。
//
// 予定は出発地・到着地の2つを持つので、場所の渡し方（既存id / Google / 自由入力）
// ごとに RPC を分けると 3×3 の変種に膨れる。そこで**指定方法を値で表す**:
//
//   null                          場所なし
//   { place_id }                  既存の場所
//   { google: {...} }             Google 由来（DB 側で無ければ作る）
//   { freetext: { name, lat?, lng?, icon? }}
//                                 自由入力（DB 側で無ければ作る）。座標は任意
//
// SQL 側の受け口は resolve_place_spec()。費用（場所は1つ）も同じ形を使う
// ＝場所の渡し方はアプリ全体でこの1つ。
export type PlaceSpec =
  | null
  | { place_id: string }
  | {
      google: {
        google_place_id: string;
        name: string;
        lat: number;
        lng: number;
        formatted_address: string;
        icon: string;
        region: string;
        locality: string;
      };
    }
  | {
      freetext: {
        name: string;
        // 座標は任意。分かっていれば地図にピンが立つ（空港など）。
        lat?: number;
        lng?: number;
        icon?: string;
      };
    };

export function placeSpec(place: PlaceInput): PlaceSpec {
  if (place.kind === "google") {
    return {
      google: {
        google_place_id: place.placeId,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        formatted_address: place.address,
        icon: place.icon ?? "",
        // 空文字は DB 側 nullif で NULL になり、既定の "pin" にフォールバックする。
        region: place.region ?? "",
        locality: place.locality ?? "",
      },
    };
  }
  if (place.kind === "free" && place.label) {
    return {
      freetext: {
        name: place.label,
        ...(place.coords ? { lat: place.coords.lat, lng: place.coords.lng } : {}),
        ...(place.icon ? { icon: place.icon } : {}),
      },
    };
  }
  const placeId = place.kind === "saved" ? place.placeId : null;
  return placeId ? { place_id: placeId } : null;
}
