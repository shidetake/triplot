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

import { CheckIcon, CloseIcon, EditIcon, TrashIcon } from "./icons";
import { MemberAvatar } from "./member-avatar";

type Member = {
  id: string;
  display_name: string;
  color: string | null;
  is_admin: boolean;
};

// メンバー管理画面のリスト。各行は MemberAvatar + 名前 + (管理者バッジ) +
// アクション。自分の行は「編集」、他人の行は「削除」(自分が admin の時のみ)。
// 自分も自分の行から「退出」できる（削除と同じアクションが、自分相手なら
// admin 不要で通る = remove_trip_member RPC の権限ロジック）。
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
  const [draftColor, setDraftColor] = useState<MemberColor>("blue");

  // 既に他のメンバーが使ってる色（自分の現在色は含めない）
  const othersColors = new Set(
    members
      .filter((m) => m.id !== myMemberId && m.color)
      .map((m) => m.color as string),
  );

  const me = members.find((m) => m.id === myMemberId);

  const startEdit = () => {
    if (!me) return;
    setDraftName(me.display_name);
    setDraftColor(isMemberColor(me.color) ? me.color : "blue");
    setEditingId(me.id);
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = () => {
    const name = draftName.trim();
    if (!name) {
      cancelEdit();
      return;
    }
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
      if (error) alert(`失敗しました: ${error}`);
    });
  };

  return (
    <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
      {members.map((m) => {
        const isMe = m.id === myMemberId;
        const showDelete = isMe || iAmAdmin;
        if (isMe && editingId === m.id) {
          // 編集パネル: 名前 + 色 picker + 保存/キャンセル
          return (
            <li key={m.id} className="flex flex-col gap-3 p-3">
              <div className="flex items-center gap-3">
                <MemberAvatar
                  name={draftName || m.display_name}
                  color={draftColor}
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
                  className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-black focus:outline-none disabled:opacity-50"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
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
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={isPending}
                  aria-label="キャンセル"
                  title="キャンセル"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  <CloseIcon size={16} />
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={isPending}
                  aria-label="保存"
                  title="保存"
                  className="flex h-9 flex-1 items-center justify-center rounded-md bg-black font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  <CheckIcon size={18} />
                </button>
              </div>
            </li>
          );
        }
        return (
          <li
            key={m.id}
            className="flex items-center gap-3 p-3"
          >
            <MemberAvatar name={m.display_name} color={m.color} size="md" />
            <span
              className={`inline-flex flex-1 items-center rounded-full px-3 py-1 text-sm ${chipClass(m.color)}`}
            >
              {m.display_name}
            </span>
            {m.is_admin && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                管理者
              </span>
            )}
            {isMe && (
              <button
                type="button"
                onClick={startEdit}
                disabled={isPending}
                aria-label="編集"
                title="編集"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
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
