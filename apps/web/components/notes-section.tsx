"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  deleteNoteReturning,
  restoreNote,
} from "@triplot/shared/data/notes";
import { notePreview, noteTitle, type NoteRow } from "@triplot/shared/notes";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { MOBILE_TAB_BOTTOM_OFFSET } from "@/lib/mobileTabChrome";
import { useUndoable } from "@/lib/undoable";

import { AddFab } from "./add-fab";
import { PlusIcon, TrashIcon } from "./icons";
import { PrivateBadge } from "./private-badge";

type MemberLite = { id: string; display_name: string };

// 旅行の画面のノートの一覧。ノートはページとして開く（/trips/<旅行>/notes/<ノート>。
// 中身は note-editor.tsx）。一覧は最後に書き換えた順。
export function NotesSection({
  tripId,
  notes,
  members,
  myMemberId,
}: {
  tripId: string;
  notes: NoteRow[];
  members: MemberLite[];
  myMemberId: string;
}) {
  const t = useTranslations("notes");
  const router = useRouter();
  const runUndoable = useUndoable(router.refresh);
  // 消した行は再取得を待たずに一覧から外す（ui-guidelines「消える時も
  // 戻る時も、画面を先に合わせる」）。
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.display_name ?? "";

  const remove = (noteId: string) => {
    runUndoable({
      apply: () => deleteNoteReturning(createClient(), noteId),
      restore: (snap) => restoreNote(createClient(), snap),
      hide: () => setHidden((s) => new Set(s).add(noteId)),
      show: () =>
        setHidden((s) => {
          const next = new Set(s);
          next.delete(noteId);
          return next;
        }),
      done: t("deleted"),
      failed: (error) => t("failed", { error }),
    });
  };

  const shown = notes.filter((n) => !hidden.has(n.id));
  const openNew = () => router.push(`/trips/${tripId}/notes/new`);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("heading")}</h2>
        {/* 広い画面は見出し行の + 。狭い画面は右下の FAB（費用と同じ）。 */}
        <Button
          type="button"
          size="icon"
          onClick={openNew}
          aria-label={t("addAria")}
          title={t("addAria")}
          className="hidden md:inline-flex"
        >
          <PlusIcon size={18} />
        </Button>
        <AddFab
          onClick={openNew}
          label={t("addAria")}
          bottom={`calc(${MOBILE_TAB_BOTTOM_OFFSET} + 16px)`}
        />
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-foreground/10 rounded-md border border-foreground/10 bg-background">
          {shown.map((n) => {
            const editingBy =
              n.lockedByMemberId && n.lockedByMemberId !== myMemberId
                ? nameOf(n.lockedByMemberId)
                : null;
            const preview = notePreview(n.body);
            return (
              <li key={n.id} className="flex items-center text-sm">
                <Link
                  href={`/trips/${tripId}/notes/${n.id}`}
                  className="min-w-0 flex-1 p-3 transition hover:bg-foreground/10"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate font-semibold">
                      {noteTitle(n.body)}
                    </span>
                    {n.visibility === "private" && <PrivateBadge />}
                  </span>
                  {(editingBy !== null || preview) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {editingBy !== null
                        ? t("editingBy", { name: editingBy })
                        : preview}
                    </span>
                  )}
                </Link>
                {/* 他の人が編集中のノートは消せない（その人の書きかけが行き場を失う）。 */}
                <Button
                  type="button"
                  variant="ghost"
                  size="iconDense"
                  onClick={() => remove(n.id)}
                  disabled={editingBy !== null}
                  aria-label={t("deleteAria")}
                  title={t("deleteAria")}
                  className="mr-2 shrink-0 rounded-full text-muted-foreground"
                >
                  <TrashIcon size={16} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
