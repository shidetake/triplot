"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { confirmDialog } from "@/components/confirm-dialog";

import {
  removeMemberAction,
  updateMyMemberAction,
} from "@/app/trips/[tripId]/actions";
import { chipStyle } from "@triplot/shared/memberColors";

import { CheckIcon, CloseIcon, CrownIcon, EditIcon, TrashIcon } from "./icons";
import { MemberAvatar } from "./member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const t = useTranslations("members");
  const tc = useTranslations("common");

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
        toast(t("changeFailed", { error }));
        return;
      }
      setEditingId(null);
    });
  };

  const remove = async (m: Member) => {
    const isSelf = m.id === myMemberId;
    const ok = isSelf
      ? await confirmDialog({
          title: t("leaveTitle"),
          body: t("leaveBody"),
          confirmLabel: t("leaveConfirm"),
        })
      : await confirmDialog({
          title: t("removeTitle", { name: m.display_name }),
          confirmLabel: t("remove"),
        });
    if (!ok) return;
    start(async () => {
      const { error } = await removeMemberAction(tripId, m.id, isSelf);
      if (error) toast(t("removeFailed", { error }));
    });
  };

  return (
    <ul className="divide-y divide-foreground/10 rounded-md border border-foreground/10 bg-background">
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
              <Input
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
                aria-label={t("displayName")}
                className="flex-1 disabled:opacity-50"
              />
              <Button
                type="button"
                variant="outline"
                size="iconSm"
                onClick={cancelEdit}
                disabled={isPending}
                aria-label={tc("cancel")}
                title={tc("cancel")}
              >
                <CloseIcon size={16} />
              </Button>
              <Button
                type="button"
                size="iconSm"
                onClick={saveEdit}
                disabled={isPending}
                aria-label={tc("save")}
                title={tc("save")}
              >
                <CheckIcon size={16} />
              </Button>
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
                  aria-label={t("admin")}
                  title={t("admin")}
                  className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background text-amber-500 ring-1 ring-background"
                >
                  <CrownIcon size={10} />
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
              <Button
                type="button"
                variant="outline"
                size="iconSm"
                onClick={startEdit}
                disabled={isPending}
                aria-label={tc("edit")}
                title={tc("edit")}
              >
                <EditIcon size={16} />
              </Button>
            )}
            {showDelete && (
              <Button
                type="button"
                variant="destructive"
                size="iconSm"
                onClick={() => remove(m)}
                disabled={isPending}
                aria-label={
                  isMe ? t("leaveAction") : t("removeAria", { name: m.display_name })
                }
                title={isMe ? t("leaveAction") : t("remove")}
              >
                <TrashIcon size={16} />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
