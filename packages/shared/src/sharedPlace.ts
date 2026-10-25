import { iconKeyForGoogleType } from "./placeIcons";

// Google マップの「共有」から旅行に足す場所のアイコン。
//
// 共有画面は追加フォームを出さず、旅行を選んだ時点で保存する（LINE の転送と
// 同じ「選んだら終わり」）ので、アイコンはこちらで決める。Google の種類
// （restaurant など）から推測し、**その旅行のピンに無ければピンにする**。
// 旅行のピンは旅行ごとに選んだ凡例なので、推測のために勝手に増やさない。
export function iconForSharedPlace(
  primaryType: string | null | undefined,
  tripPinIcons: readonly string[],
): string {
  const guess = iconKeyForGoogleType(primaryType);
  return tripPinIcons.includes(guess) ? guess : "pin";
}
