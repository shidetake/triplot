import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { fetchTripDetailRows } from "@triplot/shared/data/reads/tripDetail";
import { fetchTripPendingDrafts } from "@triplot/shared/data/reads/inbox";

import { supabase } from "./supabase";
import { useSession } from "./session";

// trip 詳細は ["trip", tripId] の1キーに全タブぶんの行を束ねる（web が
// 1ページで8クエリ分を取って全タブに配る構造と同型）。各タブはこのフックから
// 必要な部分を派生（tripDerive）して使う。mutation 後は invalidateTrip で
// キーごと再取得（= web の router.refresh 相当）。
export function useTripDetail(tripId: string) {
  const { session } = useSession();
  const query = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => fetchTripDetailRows(supabase, tripId),
    enabled: !!tripId,
  });

  const userId = session?.user.id;
  const me = query.data?.members?.find((m) => m.user_id === userId) ?? null;

  return { ...query, me, userId };
}

// この旅行に割り当て済み・未確定の取り込み下書き（予定タブの疑似ブロックと
// 費用タブの未確定ボックスが使う）。["trip", tripId] のプレフィックス配下に
// 置くので useInvalidateTrip がまとめて再取得する（確定/破棄後も1本で済む）。
export function useTripDrafts(tripId: string) {
  return useQuery({
    queryKey: ["trip", tripId, "drafts"],
    queryFn: () => fetchTripPendingDrafts(supabase, tripId),
    enabled: !!tripId,
  });
}

export function useInvalidateTrip(tripId: string) {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
    [qc, tripId],
  );
}
