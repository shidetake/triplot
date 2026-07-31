// 場所欄の3モード（予定・費用で共有する解決契約。同じ PlacePicker・同じ wire）。
// saved=保存済み or 無し、free=フリーテキスト、google=サジェスト確定（places に確定作成）。
export type PlaceInput =
  | { kind: "saved"; placeId: string | null }
  | { kind: "free"; label: string | null }
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

// PlaceInput を DB の「場所指定（place spec）」に変換する。
//
// 予定は出発地・到着地の2つを持つので、場所の渡し方（既存id / Google / 自由入力）
// ごとに RPC を分けると 3×3 の変種に膨れる。そこで**指定方法を値で表す**:
//
//   null                          場所なし
//   { place_id }                  既存の場所
//   { google: {...} }             Google 由来（DB 側で無ければ作る）
//   { freetext: { name } }        自由入力（DB 側で無ければ作る）
//
// SQL 側の受け口は resolve_place_spec()。費用（場所は1つ）も同じ形を使う。
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
  | { freetext: { name: string } };

export function placeSpec(place: PlaceInput): PlaceSpec {
  if (place.kind === "google") {
    return {
      google: {
        google_place_id: place.placeId,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        formatted_address: place.address,
        icon: "",
        // 空文字は DB 側 nullif で NULL になる。
        region: place.region ?? "",
        locality: place.locality ?? "",
      },
    };
  }
  if (place.kind === "free" && place.label) {
    return { freetext: { name: place.label } };
  }
  const placeId = place.kind === "saved" ? place.placeId : null;
  return placeId ? { place_id: placeId } : null;
}

// 費用（場所は1つ）はまだ RPC 変種方式のまま。予定のように端点が2つに
// ならないので変種の組み合わせ爆発が起きず、移行の必要度が低い。
// **ただし2方式が並ぶのは望ましくないので、費用側も spec に寄せるのが宿題。**
export function placeRpcArgs(
  place: PlaceInput,
):
  | {
      variant: "google";
      args: {
        p_google_place_id: string;
        p_place_name: string;
        p_lat: number;
        p_lng: number;
        p_formatted_address: string;
        p_icon: string;
        p_region: string;
        p_locality: string;
      };
    }
  | { variant: "free"; args: { p_place_name: string } }
  | { variant: "saved"; args: { p_place_id: string } } {
  if (place.kind === "google") {
    return {
      variant: "google",
      args: {
        p_google_place_id: place.placeId,
        p_place_name: place.name,
        p_lat: place.lat,
        p_lng: place.lng,
        p_formatted_address: place.address,
        p_icon: "",
        p_region: place.region ?? "",
        p_locality: place.locality ?? "",
      },
    };
  }
  if (place.kind === "free" && place.label) {
    return { variant: "free", args: { p_place_name: place.label } };
  }
  const placeId = place.kind === "saved" ? place.placeId : null;
  return { variant: "saved", args: { p_place_id: placeId as unknown as string } };
}
