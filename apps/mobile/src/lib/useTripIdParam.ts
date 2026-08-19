import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

// ルート階層のシート（旅行を編集・カテゴリ管理・エクスポート）が、対象の旅行を
// `?tripId=` から読むためのフック。
//
// 旅行詳細の中（入れ子スタック）にいる画面は URL の位置から取れる（useTripId）が、
// これらのシートは**どの画面からでも開ける**ようルート階層に置いてあるので、
// 位置ではなくパラメータで受け取る。どこに置くかの判断は
// docs/design/platform-parity.md の「シートはルート階層に置く」を参照。
//
// useTripId と同じく、遷移の途中で一瞬値が落ちても直近の正常値を返す
// （落ちると useTripDetail のクエリキーが変わってキャッシュを外し、
// 画面が空になる）。
export function useTripIdParam(): string {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const [stable, setStable] = useState(tripId ?? "");
  if (tripId && tripId !== stable) setStable(tripId);
  return tripId || stable;
}
