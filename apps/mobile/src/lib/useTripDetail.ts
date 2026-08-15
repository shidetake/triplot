import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId } from "react";

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

  // fetchTripDetailRows は throw せず tripError を戻り値に埋め込むので、
  // TanStack Query の isError は素通りする（query.error は素の fetch 失敗
  // 等の別経路だけを拾う）。呼び出し側はここだけ見れば良い
  // （<QueryErrorView error={loadError} onRetry={refetch} /> と組み合わせる）。
  const loadError = query.error ?? query.data?.tripError ?? null;

  return { ...query, me, userId, loadError };
}

// この旅行に割り当て済み・未確定の取り込み下書き（予定タブの疑似ブロックと
// 費用タブの未確定ボックスが使う）。["trip", tripId] のプレフィックス配下に
// 置くので useInvalidateTrip がまとめて再取得する（確定/破棄後も1本で済む）。
//
// メール取り込みの抽出はサーバー側の非同期処理（webhook/queue）で完了するため、
// クライアントの mutation に紐づく invalidate では拾えない。Supabase Realtime
// で inbound_emails（trip_id を直接持つテーブル。inbound_drafts は email_id
// 経由の JOIN が要り filter で絞れないため代わりにこちらを使う）の
// INSERT/UPDATE を購読し、この旅行宛の行が動くたび即座に再取得する
// （supabase/migrations の ALTER PUBLICATION 参照。RLS が効くので他ユーザーの
// 行は流れない）。refetchInterval は Realtime の接続が切れた時の保険として
// 残す（既定でバックグラウンド中は止まる＝focusManager 経由）。
//
// チャンネル名は useId() で呼び出しごとに一意にする（tripId だけだと、この
// フックはカレンダー/費用タブ・予定/費用フォームの複数箇所から同時に呼ばれる
// ため、同名チャンネルを2つ目が subscribe() 後に .on() しようとして
// 「cannot add postgres_changes callbacks... after subscribe()」で即クラッシュ
// した＝実機 TestFlight で確認済みの実際の障害）。
export function useTripDrafts(tripId: string) {
  const qc = useQueryClient();
  const instanceId = useId();
  useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(`inbound_emails:trip:${tripId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbound_emails",
          filter: `trip_id=eq.${tripId}`,
        },
        () => void qc.invalidateQueries({ queryKey: ["trip", tripId, "drafts"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tripId, instanceId, qc]);

  return useQuery({
    queryKey: ["trip", tripId, "drafts"],
    queryFn: () => fetchTripPendingDrafts(supabase, tripId),
    enabled: !!tripId,
    refetchInterval: 15_000,
  });
}

export function useInvalidateTrip(tripId: string) {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
    [qc, tripId],
  );
}

// 取り込み下書き（予定/費用）を確定・破棄した後に呼ぶ。DB 側は最後の1件が
// 解決されると親メール（inbound_emails）の status も confirmed/dismissed に
// 進める（finalize_inbound_email_if_resolved）が、受信箱画面は別キャッシュ
// （["inbox", userId]）を持つ独立クエリなので、trip 側の invalidate だけでは
// 反映されない。旅行側で全ての下書きが片付いた後も受信箱にその親メールが
// 残り続けていた実機フィードバックへの対応。userId は問わずプレフィックス
// 一致で全部無効化する（TanStack Query の invalidateQueries は既定で部分一致）。
export function useInvalidateInbox() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ["inbox"] }), [qc]);
}
