"use client";

import { useTransition } from "react";

import { removeMemberAction } from "@/app/trips/[tripId]/actions";

type Member = {
  id: string;
  display_name: string;
  kind: string;
};

export function MembersSection({
  tripId,
  members,
  myMemberId,
}: {
  tripId: string;
  members: Member[];
  myMemberId: string;
}) {
  const [isPending, start] = useTransition();

  const remove = (m: Member) => {
    const isSelf = m.id === myMemberId;
    const msg = isSelf
      ? "この旅行から退出しますか？（招待リンクから再参加できます）"
      : `${m.display_name} をこの旅行から外しますか？`;
    if (!confirm(msg)) return;
    start(async () => {
      const { error } = await removeMemberAction(tripId, m.id, isSelf);
      if (error) alert(`失敗しました: ${error}`);
    });
  };

  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {members.map((m) => (
        <li
          key={m.id}
          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm"
        >
          <span>{m.display_name}</span>
          <span className="text-xs text-zinc-500">({m.kind})</span>
          <button
            type="button"
            onClick={() => remove(m)}
            disabled={isPending}
            aria-label={
              m.id === myMemberId ? "退出する" : `${m.display_name} を外す`
            }
            className="ml-0.5 rounded-full px-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-50"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
