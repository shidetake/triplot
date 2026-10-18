"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  acquireNoteLock,
  createNote,
  deleteNoteReturning,
  releaseNoteLock,
  renewNoteLock,
  restoreNote,
  saveNote,
  type NoteVisibility,
} from "@triplot/shared/data/notes";
import {
  NOTE_LOCK_RENEW_MS,
  notePreview,
  noteSegments,
  noteTitle,
  type NoteRow,
} from "@triplot/shared/notes";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { MOBILE_TAB_BOTTOM_OFFSET } from "@/lib/mobileTabChrome";
import { useUndoable } from "@/lib/undoable";

import { AddFab } from "./add-fab";
import { FormCloseRow } from "./form-close-row";
import { type Anchor, FormPopover } from "./form-popover";
import { PlusIcon, TrashIcon } from "./icons";
import { PrivateBadge } from "./private-badge";
import { toast } from "./toast";

type MemberLite = { id: string; display_name: string };

// 編集画面が閉じた時点の中身。閉じる＝保存なので、閉じた後の書き込みは
// 一覧の側（このコンポーネント）が持つ（編集画面はもう居ないので、結果の
// 知らせや「元に戻す」をそちらでは出せない）。
type EditorSnapshot = {
  noteId: string | null;
  body: string;
  visibility: NoteVisibility;
  // 編集中（ロックを持っている）なら token。表示しただけなら null。
  token: string | null;
  original: { body: string; visibility: NoteVisibility };
  // 期限切れの間に他の人がロックを取った（この内容は保存できない）。
  lost: boolean;
};

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
  const [open, setOpen] = useState<{ note: NoteRow | null; anchor: Anchor } | null>(
    null,
  );
  const snapshot = useRef<EditorSnapshot | null>(null);
  const report = useCallback((s: EditorSnapshot) => {
    snapshot.current = s;
  }, []);
  // 消した行は再取得を待たずに一覧から外す（ui-guidelines「消える時も
  // 戻る時も、画面を先に合わせる」）。
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.display_name ?? "";

  const copyAction = (body: string) => ({
    label: t("copy"),
    onClick: () => {
      void navigator.clipboard.writeText(body).then(() => toast(t("copied")));
    },
  });

  const remove = useCallback(
    (noteId: string) => {
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
    },
    [runUndoable, t],
  );

  // 閉じた時の書き込み。
  const persist = async (s: EditorSnapshot) => {
    const sb = createClient();
    const changed =
      s.body !== s.original.body || s.visibility !== s.original.visibility;

    if (s.noteId === null) {
      if (s.body.trim() === "") return;
      const r = await createNote(sb, tripId, s.body, s.visibility);
      if (!r.ok) toast(t("failed", { error: r.error }), copyAction(s.body));
      router.refresh();
      return;
    }
    if (s.token === null) return;
    if (s.lost) {
      if (changed) toast(t("saveLost"), copyAction(s.body));
      return;
    }
    // 空にして閉じたら消す（iOS のメモ帳と同じ）。ロックは自分が持っているので消せる。
    if (s.body.trim() === "") {
      await releaseNoteLock(sb, s.noteId, s.token);
      remove(s.noteId);
      return;
    }
    if (!changed) {
      await releaseNoteLock(sb, s.noteId, s.token);
      router.refresh();
      return;
    }
    const r = await saveNote(sb, s.noteId, s.token, s.body, s.visibility);
    if (!r.ok) toast(t("failed", { error: r.error }), copyAction(s.body));
    else if (!r.data) toast(t("saveLost"), copyAction(s.body));
    router.refresh();
  };

  const close = () => {
    const s = snapshot.current;
    snapshot.current = null;
    setOpen(null);
    if (s) void persist(s);
  };

  const shown = notes.filter((n) => !hidden.has(n.id));
  const openNew = (e: React.MouseEvent) =>
    setOpen({ note: null, anchor: { x: e.clientX, y: e.clientY } });

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
                <button
                  type="button"
                  onClick={(e) =>
                    setOpen({ note: n, anchor: { x: e.clientX, y: e.clientY } })
                  }
                  className="min-w-0 flex-1 p-3 text-left transition hover:bg-foreground/10"
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
                </button>
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

      {open && (
        <FormPopover
          anchor={open.anchor}
          onClose={close}
          label={t("formLabel")}
          fullScreenOnNarrow
        >
          <NoteEditor
            key={open.note?.id ?? "new"}
            note={open.note}
            myMemberId={myMemberId}
            nameOf={nameOf}
            onClose={close}
            report={report}
          />
        </FormPopover>
      )}
    </>
  );
}

// 表示中と編集中の2つのモードを持つ。表示中はリンクを押せばリンク先、
// それ以外を押せばロックを取って編集に入る（iOS のメモ帳と同じ）。
// 新しいノートは最初から編集中（まだ誰にも見えないのでロックは要らない）。
function NoteEditor({
  note,
  myMemberId,
  nameOf,
  onClose,
  report,
}: {
  note: NoteRow | null;
  myMemberId: string;
  nameOf: (memberId: string) => string;
  onClose: () => void;
  report: (s: EditorSnapshot) => void;
}) {
  const t = useTranslations("notes");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState(note === null);
  const [body, setBody] = useState(note?.body ?? "");
  const [visibility, setVisibility] = useState<NoteVisibility>(
    note?.visibility ?? "shared",
  );
  const [original, setOriginal] = useState({
    body: note?.body ?? "",
    visibility: note?.visibility ?? ("shared" as NoteVisibility),
  });
  const [token, setToken] = useState<string | null>(null);
  const [lost, setLost] = useState(false);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    report({
      noteId: note?.id ?? null,
      body,
      visibility,
      token,
      original,
      lost,
    });
  }, [note, body, visibility, token, original, lost, report]);

  // 編集中は期限を延ばし続ける。延ばせなかった＝他の人が取った。
  useEffect(() => {
    if (!note || !token) return;
    const id = window.setInterval(() => {
      void renewNoteLock(createClient(), note.id, token).then((r) => {
        if (r.ok && !r.data) setLost(true);
      });
    }, NOTE_LOCK_RENEW_MS);
    return () => window.clearInterval(id);
  }, [note, token]);

  // 閉じる＝保存なので、タブごと閉じると書きかけが消える。その時だけ止める。
  const dirty =
    editing && (body !== original.body || visibility !== original.visibility);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!editing) return;
    const el = textarea.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const startEditing = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) return;
    if (!note || busy) return;
    setBusy(true);
    const r = await acquireNoteLock(createClient(), note.id);
    setBusy(false);
    if (!r.ok) {
      toast(t("failed", { error: r.error }));
      return;
    }
    if (!r.data.ok) {
      setLockedBy(nameOf(r.data.holderMemberId));
      return;
    }
    // 一覧で見ていた本文は古いかもしれないので、取れた時点の本文から始める。
    setBody(r.data.body);
    setVisibility(r.data.visibility);
    setOriginal({ body: r.data.body, visibility: r.data.visibility });
    setToken(r.data.token);
    setLockedBy(null);
    setEditing(true);
  };

  // 自分だけにできるのは作った人だけ（DB も同じ規則で止める）。
  const canChangeVisibility =
    note === null || note.createdByMemberId === myMemberId;

  return (
    <div className="relative space-y-3 p-4">
      <FormCloseRow onClose={onClose}>
        <div className="min-w-0 flex-1">
          {editing ? (
            <textarea
              ref={textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              className="block min-h-60 w-full resize-y rounded-md border border-foreground/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
            />
          ) : (
            <div
              onClick={(e) => void startEditing(e)}
              className="min-h-24 cursor-text whitespace-pre-wrap break-words text-sm"
            >
              {noteSegments(body).map((s, i) =>
                s.kind === "link" ? (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {s.text}
                  </a>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </div>
          )}
        </div>
      </FormCloseRow>

      {lockedBy !== null && (
        <p className="text-xs text-muted-foreground">
          {t("lockedNow", { name: lockedBy })}
        </p>
      )}
      {lost && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("lockLost")}
        </p>
      )}

      {editing && canChangeVisibility && (
        <div
          className="flex gap-3 text-sm"
          role="radiogroup"
          aria-label={t("visibility")}
        >
          {(["shared", "private"] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="note-visibility"
                checked={visibility === v}
                onChange={() => setVisibility(v)}
              />
              <span>{v === "shared" ? tCommon("shared") : tCommon("selfOnly")}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
