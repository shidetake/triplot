"use client";

import { useState, useTransition } from "react";

import {
  removeMemberAction,
  renameSelfAction,
} from "@/app/trips/[tripId]/actions";

import { CheckIcon, CloseIcon, EditIcon } from "./icons";

type Member = {
  id: string;
  display_name: string;
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const me = members.find((m) => m.id === myMemberId);

  const startEdit = () => {
    if (!me) return;
    setDraft(me.display_name);
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    const name = draft.trim();
    if (!name) {
      cancelEdit();
      return;
    }
    if (me && name === me.display_name) {
      cancelEdit();
      return;
    }
    start(async () => {
      const { error } = await renameSelfAction(tripId, name);
      if (error) {
        alert(`変更に失敗しました: ${error}`);
        return;
      }
      setEditing(false);
    });
  };

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
      {members.map((m) => {
        const isMe = m.id === myMemberId;

        if (isMe && editing) {
          // 自分の行を編集モード。chip 全体を input + 保存/キャンセル に置換。
          return (
            <li
              key={m.id}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm"
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveEdit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                maxLength={32}
                disabled={isPending}
                aria-label="表示名"
                className="w-28 min-w-0 rounded-sm border-b border-zinc-400 bg-transparent text-sm outline-none focus:border-black disabled:opacity-50"
              />
              <button
                type="button"
                onClick={saveEdit}
                disabled={isPending}
                aria-label="保存"
                className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800 disabled:opacity-50"
              >
                <CheckIcon size={12} />
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                aria-label="キャンセル"
                className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-50"
              >
                <CloseIcon size={12} />
              </button>
            </li>
          );
        }

        return (
          <li
            key={m.id}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm"
          >
            <span>{m.display_name}</span>
            {isMe && (
              <button
                type="button"
                onClick={startEdit}
                disabled={isPending}
                aria-label="名前を変更"
                title="名前を変更"
                className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-50"
              >
                <EditIcon size={12} />
              </button>
            )}
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
        );
      })}
    </ul>
  );
}
