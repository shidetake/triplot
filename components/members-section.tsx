"use client";

import { useState, useTransition } from "react";

import {
  removeMemberAction,
  updateMyMemberAction,
} from "@/app/trips/[tripId]/actions";
import {
  MEMBER_COLORS,
  chipClass,
  isMemberColor,
  swatchClass,
  type MemberColor,
} from "@/lib/memberColors";

import { CheckIcon, CloseIcon, EditIcon } from "./icons";

type Member = {
  id: string;
  display_name: string;
  color: string | null;
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
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState<MemberColor>("blue");

  const me = members.find((m) => m.id === myMemberId);

  // 自分以外のアクティブメンバーが使用中の色 → picker で disable する。
  const othersColors = new Set(
    members
      .filter((m) => m.id !== myMemberId && m.color)
      .map((m) => m.color as string),
  );

  const startEdit = () => {
    if (!me) return;
    setDraftName(me.display_name);
    setDraftColor(isMemberColor(me.color) ? me.color : "blue");
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    const name = draftName.trim();
    if (!name) {
      cancelEdit();
      return;
    }
    // 変更なしなら no-op
    if (me && name === me.display_name && draftColor === me.color) {
      cancelEdit();
      return;
    }
    start(async () => {
      const { error } = await updateMyMemberAction(tripId, name, draftColor);
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
          // 編集モード: chip を panel に置き換え。名前 + 色を 1 回で保存。
          return (
            <li
              key={m.id}
              className="inline-flex flex-col gap-2 rounded-xl bg-white p-3 text-sm shadow ring-1 ring-zinc-200"
            >
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
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
                className="w-36 rounded border-b border-zinc-400 bg-transparent text-sm outline-none focus:border-black disabled:opacity-50"
              />
              <div className="flex flex-wrap gap-1.5">
                {MEMBER_COLORS.map((c) => {
                  const taken = othersColors.has(c);
                  const selected = draftColor === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        if (!taken) setDraftColor(c);
                      }}
                      disabled={taken || isPending}
                      aria-label={c}
                      aria-pressed={selected}
                      className={`h-6 w-6 rounded-full ${swatchClass(c)} ${
                        taken ? "cursor-not-allowed opacity-25" : ""
                      } ${
                        selected
                          ? "outline-2 outline-offset-2 outline-zinc-900"
                          : "outline-1 outline-black/10"
                      }`}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={isPending}
                  aria-label="キャンセル"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50"
                >
                  <CloseIcon size={14} />
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={isPending}
                  aria-label="保存"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
                >
                  <CheckIcon size={14} />
                </button>
              </div>
            </li>
          );
        }

        return (
          <li
            key={m.id}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${chipClass(m.color)}`}
          >
            <span>{m.display_name}</span>
            {isMe && (
              <button
                type="button"
                onClick={startEdit}
                disabled={isPending}
                aria-label="名前と色を変更"
                title="名前と色を変更"
                className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-current opacity-60 transition hover:bg-black/10 hover:opacity-100 disabled:opacity-50"
              >
                <EditIcon size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(m)}
              disabled={isPending}
              aria-label={
                isMe ? "退出する" : `${m.display_name} を外す`
              }
              className="ml-0.5 rounded-full px-1 text-current opacity-60 transition hover:bg-black/10 hover:opacity-100 disabled:opacity-50"
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
