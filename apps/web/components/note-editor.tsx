"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  noteSegments,
  type NoteRow,
} from "@triplot/shared/notes";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useUndoable } from "@/lib/undoable";

import { FieldLabel } from "./field-label";
import { CheckIcon, EditIcon } from "./icons";
import { toast } from "./toast";

// ノートのページ（/trips/<旅行>/notes/<ノート>、新規は /notes/new）の中身。
// ノートは長い文章を読み書きする行き先そのものなので、フォームのような
// ポップアップではなくページとして開く（ui-guidelines「全画面表示を使う場面」）。
//
// 表示中と編集中の2つのモードを持つ（iOS のメモ帳・連絡先の「編集」「完了」と同じ）。
//   - 表示中: 鉛筆で編集に入る（ロックを取る）。本文を押しても入らない
//     （うっかり入って他の人をロックで締め出さないように）。リンクは押せる
//   - 編集中: ✓で保存して表示中に戻る（ロックを外す）
//   - ✓を押さずにページを離れても保存する（押し忘れの保険。ui-guidelines
//     「保存ボタンの要否」）
// 新しいノートは最初から編集中（まだ誰にも見えないのでロックは要らない）。

type Session = {
  noteId: string | null;
  body: string;
  visibility: NoteVisibility;
  // 編集中（ロックを持っている）なら token。表示しただけなら null。
  token: string | null;
  original: { body: string; visibility: NoteVisibility };
  // 期限切れの間に他の人がロックを取った（この内容は保存できない）。
  lost: boolean;
};

export function NoteEditor({
  tripId,
  note,
  myMemberId,
  members,
  backHref,
}: {
  tripId: string;
  note: NoteRow | null;
  myMemberId: string;
  members: { id: string; display_name: string }[];
  // 空にして保存した（＝ノートが消えた）時の行き先。
  backHref: string;
}) {
  const t = useTranslations("notes");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const runUndoable = useUndoable(router.refresh);
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.display_name ?? "";

  // 新しいノートは作った時点で id を持つ。
  const [noteId, setNoteId] = useState<string | null>(note?.id ?? null);
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

  // 離れた時点の中身を書き込むため、最新を控えておく。
  const session = useRef<Session | null>(null);
  useEffect(() => {
    session.current = { noteId, body, visibility, token, original, lost };
  });

  const copyAction = (text: string) => ({
    label: t("copy"),
    onClick: () => {
      void navigator.clipboard.writeText(text).then(() => toast(t("copied")));
    },
  });

  // 消して「元に戻す」を出す。ロックは自分が持っているので消せる。
  const removeEmptied = async (id: string, lockToken: string) => {
    await releaseNoteLock(createClient(), id, lockToken);
    runUndoable({
      apply: () => deleteNoteReturning(createClient(), id),
      restore: (snap) => restoreNote(createClient(), snap),
      done: t("deleted"),
      failed: (error) => t("failed", { error }),
    });
  };

  // ✓を押さずにページを離れた時の保険。離れた後に走るので、結果はトーストで
  // 知らせ、一覧（戻った先の旅行のページ）は書き終えてから取り直す。
  const persistOnLeave = async (s: Session) => {
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
    if (s.body.trim() === "") {
      await removeEmptied(s.noteId, s.token);
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
  const persistRef = useRef(persistOnLeave);
  useEffect(() => {
    persistRef.current = persistOnLeave;
  });

  useEffect(
    () => () => {
      if (session.current) void persistRef.current(session.current);
    },
    [],
  );

  // 保存して表示中に戻ったことにする（離れた時の保険がもう一度書かないように、
  // 控えも同じ形に揃える）。
  const finishEditing = (savedBody: string, savedVisibility: NoteVisibility) => {
    setOriginal({ body: savedBody, visibility: savedVisibility });
    setToken(null);
    setEditing(false);
  };

  // ✓。保存して表示中に戻る。
  const save = async () => {
    if (busy) return;
    const sb = createClient();
    const changed =
      body !== original.body || visibility !== original.visibility;

    if (noteId === null) {
      if (body.trim() === "") {
        router.push(backHref);
        return;
      }
      setBusy(true);
      const r = await createNote(sb, tripId, body, visibility);
      setBusy(false);
      if (!r.ok) {
        toast(t("failed", { error: r.error }));
        return;
      }
      setNoteId(r.data);
      finishEditing(body, visibility);
      // 再読み込みしても今のノートが開くよう、URL を作ったノートのものにする。
      window.history.replaceState(null, "", `/trips/${tripId}/notes/${r.data}`);
      return;
    }
    if (token === null) return;
    if (lost) {
      toast(t("saveLost"), copyAction(body));
      return;
    }
    if (body.trim() === "") {
      // 消えたノートのページに残っても仕方がないので、一覧へ戻る。
      session.current = null;
      void removeEmptied(noteId, token);
      router.push(backHref);
      return;
    }
    setBusy(true);
    if (!changed) {
      await releaseNoteLock(sb, noteId, token);
      setBusy(false);
      finishEditing(body, visibility);
      return;
    }
    const r = await saveNote(sb, noteId, token, body, visibility);
    setBusy(false);
    if (!r.ok) {
      toast(t("failed", { error: r.error }));
      return;
    }
    if (!r.data) {
      setLost(true);
      toast(t("saveLost"), copyAction(body));
      return;
    }
    finishEditing(body, visibility);
  };

  // 鉛筆。ロックを取って編集に入る。
  const startEditing = async () => {
    if (!noteId || busy) return;
    setBusy(true);
    const r = await acquireNoteLock(createClient(), noteId);
    setBusy(false);
    if (!r.ok) {
      toast(t("failed", { error: r.error }));
      return;
    }
    if (!r.data.ok) {
      setLockedBy(nameOf(r.data.holderMemberId));
      return;
    }
    // 見ていた本文は古いかもしれないので、取れた時点の本文から始める。
    setBody(r.data.body);
    setVisibility(r.data.visibility);
    setOriginal({ body: r.data.body, visibility: r.data.visibility });
    setToken(r.data.token);
    setLost(false);
    setLockedBy(null);
    setEditing(true);
  };

  // タブごと閉じる・再読み込みは保存が間に合わないので、書きかけがある時だけ止める。
  const dirty =
    editing && (body !== original.body || visibility !== original.visibility);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // 編集中は期限を延ばし続ける。延ばせなかった＝他の人が取った。
  useEffect(() => {
    if (!noteId || !token) return;
    const id = window.setInterval(() => {
      void renewNoteLock(createClient(), noteId, token).then((r) => {
        if (r.ok && !r.data) setLost(true);
      });
    }, NOTE_LOCK_RENEW_MS);
    return () => window.clearInterval(id);
  }, [noteId, token]);

  // 入力欄は中身に合わせて伸ばす（ページごとスクロールさせ、入力欄の中に
  // もう1つスクロールを作らない）。
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = textarea.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  // 自分だけにできるのは作った人だけ（DB も同じ規則で止める）。
  const canChangeVisibility =
    note === null || note.createdByMemberId === myMemberId;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        {lockedBy !== null && (
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {t("lockedNow", { name: lockedBy })}
          </p>
        )}
        {editing ? (
          <Button
            type="button"
            size="icon"
            onClick={() => void save()}
            disabled={busy}
            aria-label={tCommon("save")}
            title={tCommon("save")}
            className="rounded-full"
          >
            <CheckIcon size={20} />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void startEditing()}
            disabled={busy}
            aria-label={tCommon("edit")}
            title={tCommon("edit")}
            className="rounded-full"
          >
            <EditIcon size={18} />
          </Button>
        )}
      </div>

      {lost && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {t("lockLost")}
        </p>
      )}

      {editing ? (
        <textarea
          ref={textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          className="block min-h-[60vh] w-full resize-none overflow-hidden bg-transparent text-base leading-relaxed outline-none placeholder:text-subtle-foreground"
        />
      ) : (
        <div className="min-h-[60vh] whitespace-pre-wrap break-words text-base leading-relaxed">
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

      {/* 公開範囲は表示中も見せる（誰に見えているかは読む時にも知りたい）。
          変えられるのは編集中だけで、自分だけにできるのは作った人だけ。
          予定・費用のフォームと同じく、ラベルの右に並べる。 */}
      <div className="flex items-center gap-3 border-t border-foreground/10 pt-4 text-sm">
        <FieldLabel>{t("visibility")}</FieldLabel>
        {editing && canChangeVisibility ? (
          <div
            className="flex gap-3"
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
                <span>
                  {v === "shared" ? tCommon("shared") : tCommon("selfOnly")}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">
            {visibility === "shared" ? tCommon("shared") : tCommon("selfOnly")}
          </span>
        )}
      </div>
    </div>
  );
}
