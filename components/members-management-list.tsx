"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/toast";

import {
  removeMemberAction,
  updateMyMemberAction,
} from "@/app/trips/[tripId]/actions";
import { chipStyle } from "@/lib/memberColors";

import { CheckIcon, CloseIcon, CrownIcon, EditIcon, TrashIcon } from "./icons";
import { MemberAvatar } from "./member-avatar";

type Member = {
  id: string;
  display_name: string;
  color: number | null;
  is_admin: boolean;
};

// メンバー管理画面のリスト。各行は MemberAvatar + 名前 + (管理者バッジ) +
// アクション。自分の行は「名前編集」、他人の行は「削除」(自分が admin の時のみ)。
// 自分も自分の行から「退出」できる（同 RPC で自分相手なら admin 不要で通る）。
// 色はメンバー側で変更不可（参加時に自動割当、変更 UI は持たない）。
export function MembersManagementList({
  tripId,
  members,
  myMemberId,
  iAmAdmin,
}: {
  tripId: string;
  members: Member[];
  myMemberId: string;
  iAmAdmin: boolean;
}) {
  const [isPending, start] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const me = members.find((m) => m.id === myMemberId);

  const startEdit = () => {
    if (!me) return;
    setDraftName(me.display_name);
    setEditingId(me.id);
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = () => {
    const name = draftName.trim();
    if (!name) {
      cancelEdit();
      return;
    }
    if (me && name === me.display_name) {
      cancelEdit();
      return;
    }
    start(async () => {
      const { error } = await updateMyMemberAction(tripId, name);
      if (error) {
        toast(`変更に失敗しました: ${error}`);
        return;
      }
      setEditingId(null);
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
      if (error) toast(`失敗しました: ${error}`);
    });
  };

  return (
    <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
      {members.map((m) => {
        const isMe = m.id === myMemberId;
        const showDelete = isMe || iAmAdmin;
        if (isMe && editingId === m.id) {
          // 編集パネル: 名前のみ。色は自動割当で変更不可。
          return (
            <li key={m.id} className="flex items-center gap-3 p-3">
              <MemberAvatar
                name={draftName || m.display_name}
                color={m.color}
                size="md"
              />
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
                className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                aria-label="キャンセル"
                title="キャンセル"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-muted-foreground transition hover:bg-foreground/10 disabled:opacity-50"
              >
                <CloseIcon size={16} />
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={isPending}
                aria-label="保存"
                title="保存"
                className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                <CheckIcon size={16} />
              </button>
            </li>
          );
        }
        return (
          <li key={m.id} className="flex items-center gap-3 p-3">
            <span className="relative inline-flex shrink-0">
              <MemberAvatar name={m.display_name} color={m.color} size="md" />
              {m.is_admin && (
                <span
                  role="img"
                  aria-label="管理者"
                  title="管理者"
                  className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-amber-500 ring-1 ring-white"
                >
                  <CrownIcon size={9} />
                </span>
              )}
            </span>
            <span
              style={chipStyle(m.color)}
              className="inline-flex flex-1 items-center rounded-full px-3 py-1 text-sm"
            >
              {m.display_name}
            </span>
            {isMe && (
              <button
                type="button"
                onClick={startEdit}
                disabled={isPending}
                aria-label="編集"
                title="編集"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-muted-foreground transition hover:bg-foreground/10 disabled:opacity-50"
              >
                <EditIcon size={16} />
              </button>
            )}
            {showDelete && (
              <button
                type="button"
                onClick={() => remove(m)}
                disabled={isPending}
                aria-label={isMe ? "退出する" : `${m.display_name} を外す`}
                title={isMe ? "退出する" : "外す"}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                <TrashIcon size={16} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
