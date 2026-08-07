import { useGlobalSearchParams } from "expo-router";
import { useState } from "react";

// trip 詳細の4タブ配下で tripId を読む。
// 注意: useLocalSearchParams は Tabs 配下の子スクリーンだと、タブバーでの
// タブ切替時に親の動的セグメント（[tripId]）を返さず undefined になる
// （deep-link で直接その URL に来た時だけ入る）。useGlobalSearchParams は
// URL 全体の params を読むので、どのタブでも常に tripId が取れる。
//
// ただし useGlobalSearchParams は URL 全体を見るぶん、**画面遷移の途中で
// 一瞬 tripId を落とす**ことがある（型は string だが実際には undefined が
// 来うる）。落ちると useTripDetail のクエリキーが ["trip", undefined] に
// 変わってキャッシュを外し、旅行名が空 → ヘッダーの setOptions が連続発火
// する。react-native-screens はヘッダーの高頻度更新で戻るボタンを描画
// しなくなることがある（再起動するまで直らない実機報告あり。
// [tripId]/_layout.tsx のメモ化もこの対策）。
//
// 0 以外の値が来た時だけ更新する「直近の正常値」ラッチで吸収し、宣言どおり
// 常に string を返すようにする（insets.top の同種の対策と同じ形）。別の旅行へ
// 移ったときは新しい id が来るので追従する。
export function useTripId(): string {
  const { tripId } = useGlobalSearchParams<{ tripId: string }>();
  // レンダー中に state を調整する React 公式パターン（useRef だと
  // react-hooks/refs に弾かれる）。
  const [stableTripId, setStableTripId] = useState(tripId);
  if (tripId && tripId !== stableTripId) setStableTripId(tripId);
  return tripId || stableTripId;
}
