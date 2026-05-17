"use client";

import { useTransition } from "react";

import { deleteTripAction } from "@/app/trips/[tripId]/actions";

export function DeleteTripButton({ tripId }: { tripId: string }) {
  const [isPending, start] = useTransition();

  const onDelete = () => {
    if (
      !confirm(
        "この旅行を削除します。予定・場所・費用・メンバーもすべて消え、元に戻せません。よろしいですか？",
      )
    )
      return;
    start(async () => {
      const { error } = await deleteTripAction(tripId);
      // 成功時は deleteTripAction 内で / へ redirect
      if (error) alert(`削除に失敗しました: ${error}`);
    });
  };

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={isPending}
      className="text-xs text-red-600 underline-offset-2 hover:underline disabled:opacity-50"
    >
      {isPending ? "削除中..." : "この旅行を削除"}
    </button>
  );
}
