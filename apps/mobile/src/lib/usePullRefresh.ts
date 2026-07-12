import { useCallback, useState } from "react";

// 引っ張り更新の refreshing はローカル状態で持つ（React Query の isRefetching を
// RefreshControl に直結しない）。isRefetching は共有クエリの背景再取得（タブ
// マウント時の stale 再取得・mutation 後の invalidate）でも立つため、引っ張って
// いないのにスピナーが出る。しかも iOS の RefreshControl はマウント時点で
// refreshing=true だと表示が固まり消えなくなる（実機で発生）。
export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, onRefresh };
}
