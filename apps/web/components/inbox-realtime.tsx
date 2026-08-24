"use client";

import { useEffect, useId } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

// 自分宛の取り込みメールが動いたら画面を作り直す（サーバー再描画）。
//
// 旅行画面の TripDraftsRealtime と同じ仕組みだが、購読の絞りが違う。
// 旅行の候補（仮旅行）を出す一覧では**まだ旅行に割り当てられていない**行が
// 対象で、それらは trip_id が null なので trip_id では絞れない。代わりに
// user_id で絞る（RLS が効くのでそもそも他ユーザーの行は流れない）。
//
// 取り込みの抽出はサーバー側の非同期処理で完了するので、これが無いと
// 「メールを転送したのに一覧に候補が出てこない、リロードするまで気づけない」
// という状態になる。接続が切れている間の取りこぼしは RefreshOnFocus が拾う。
export function InboxRealtime({ userId }: { userId: string }) {
  const router = useRouter();
  // 同名チャンネルの二重 subscribe を避ける（TripDraftsRealtime と同じ理由）。
  const instanceId = useId();

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`inbound_emails:user:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbound_emails",
          filter: `user_id=eq.${userId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, instanceId, router]);

  return null;
}
