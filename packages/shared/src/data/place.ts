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

// PlaceInput を「どの RPC バリアントを呼ぶか＋場所まわりの引数」に解決する。
// expenses / events 共通の3分岐（google → *_with_place、free＋label → *_with_freetext_place、
// それ以外〔saved or 空 free〕→ 素の RPC に p_place_id）。
// gen-types は nullable 引数を string にする癖があるため null は string にキャストして渡す。
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
        // 空文字は DB 側 nullif で NULL になる。
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
