"use client";

import { useEffect, useId } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

// メール取り込みの下書きが届いたら旅行画面を作り直す（サーバー再描画）。
//
// 取り込みの抽出はサーバー側の非同期処理（webhook/queue）で完了するので、
// クライアントの操作に紐づく再検証では拾えない。転送したのに画面に出てこない
// ＝リロードするまで気づけない、という状態だった（iOS は Realtime 購読で
// 即反映していて、そこだけ web が取り残されていた）。
//
// 購読対象は inbound_emails（trip_id を直接持つテーブル。inbound_drafts は
// email_id 経由の JOIN が要り filter で絞れない）。RLS が効くので他ユーザーの
// 行は流れない。iOS の useTripDrafts と同じ選択。
//
// 接続が切れている間の取りこぼしは、タブに戻ってきた時の再描画で拾う
// （RefreshOnFocus。旅行一覧・受信箱と共通の部品）。
export function TripDraftsRealtime({ tripId }: { tripId: string }) {
  const router = useRouter();
  // 同じチャンネル名を2つ purchase しないよう、インスタンスごとに一意にする
  // （iOS で同名チャンネルの二重 subscribe がクラッシュした事例に倣う）。
  const instanceId = useId();

  useEffect(() => {
    if (!tripId) return;
    const supabase = createClient();
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
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tripId, instanceId, router]);

  return null;
}
