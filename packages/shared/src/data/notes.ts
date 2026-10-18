import type { DB } from "./client";
import { err, ok, type Result } from "./result";

// ノート。書き込みはすべて RPC（行への直接の書き込みは RLS で通さない）。
// 同時編集は期限付きのロックで防ぐ。仕組みは migration 20261018000000_notes.sql
// の冒頭、表示の決まりは @triplot/shared/notes。

export type NoteVisibility = "shared" | "private";

// 書きかけのまま新しく作る時はロックは要らない（まだ誰にも見えていない）。
export async function createNote(
  sb: DB,
  tripId: string,
  body: string,
  visibility: NoteVisibility,
): Promise<Result<string>> {
  const { data, error } = await sb.rpc("create_note", {
    p_trip_id: tripId,
    p_body: body,
    p_visibility: visibility,
  });
  if (error) return err(error.message);
  return ok(data);
}

export type NoteLock =
  | { ok: true; token: string; body: string; visibility: NoteVisibility }
  | { ok: false; holderMemberId: string };

// 編集に入る時に取る。取れたら、その時点の本文から編集を始める（一覧で
// 見ていた本文は、他の人の保存で古くなっているかもしれない）。
export async function acquireNoteLock(
  sb: DB,
  noteId: string,
): Promise<Result<NoteLock>> {
  const { data, error } = await sb.rpc("acquire_note_lock", {
    p_note_id: noteId,
  });
  if (error) return err(error.message);
  const r = data as {
    ok: boolean;
    token?: string;
    body?: string;
    visibility?: NoteVisibility;
    holder_member_id?: string;
  };
  return ok(
    r.ok
      ? { ok: true, token: r.token!, body: r.body!, visibility: r.visibility! }
      : { ok: false, holderMemberId: r.holder_member_id! },
  );
}

// 期限を延ばす。false＝ロックが他の人に移った（期限切れの間に取られた）。
export async function renewNoteLock(
  sb: DB,
  noteId: string,
  token: string,
): Promise<Result<boolean>> {
  const { data, error } = await sb.rpc("renew_note_lock", {
    p_note_id: noteId,
    p_token: token,
  });
  if (error) return err(error.message);
  return ok(data);
}

// 保存してロックを外す。false＝ロックが他の人に移っていた・ノートが消えていた
// （何も書いていない。呼び出し側は書きかけを手元に残せるようにする）。
export async function saveNote(
  sb: DB,
  noteId: string,
  token: string,
  body: string,
  visibility: NoteVisibility,
): Promise<Result<boolean>> {
  const { data, error } = await sb.rpc("save_note", {
    p_note_id: noteId,
    p_token: token,
    p_body: body,
    p_visibility: visibility,
  });
  if (error) return err(error.message);
  return ok(data);
}

// 何も変えずに閉じた時。
export async function releaseNoteLock(
  sb: DB,
  noteId: string,
  token: string,
): Promise<Result<void>> {
  const { error } = await sb.rpc("release_note_lock", {
    p_note_id: noteId,
    p_token: token,
  });
  if (error) return err(error.message);
  return ok(undefined);
}

// 消したノートの控え（restoreNote にそのまま渡す）。中身は SQL 側が決める。
export type NoteSnapshot = Record<string, unknown>;

// 他の人が編集中のノートは消せない（DB が止める）。
export async function deleteNoteReturning(
  sb: DB,
  noteId: string,
): Promise<Result<NoteSnapshot>> {
  const { data, error } = await sb.rpc("delete_note_returning", {
    p_id: noteId,
  });
  if (error) return err(error.message);
  return ok(data as NoteSnapshot);
}

export async function restoreNote(
  sb: DB,
  snapshot: NoteSnapshot,
): Promise<Result<void>> {
  const { error } = await sb.rpc("restore_note", {
    p_snapshot: snapshot as never,
  });
  if (error) return err(error.message);
  return ok(undefined);
}
