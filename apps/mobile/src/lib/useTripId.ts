import { useGlobalSearchParams } from "expo-router";

// trip 詳細の4タブ配下で tripId を読む。
// 注意: useLocalSearchParams は Tabs 配下の子スクリーンだと、タブバーでの
// タブ切替時に親の動的セグメント（[tripId]）を返さず undefined になる
// （deep-link で直接その URL に来た時だけ入る）。useGlobalSearchParams は
// URL 全体の params を読むので、どのタブでも常に tripId が取れる。
export function useTripId(): string {
  const { tripId } = useGlobalSearchParams<{ tripId: string }>();
  return tripId;
}
