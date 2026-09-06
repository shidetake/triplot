import type { DB } from "./client";
import { err, ok, type Result } from "./result";

// TODO（やりたいこと）。共有リスト。作成だけ created_by_member_id 解決のため RPC、
// 更新（チェック / 本文 / 優先度）と削除は RLS 配下の素の table 操作。

export type CreateTodoInput = {
  tripId: string;
  title: string;
  priority: string;
  kind: string;
  visibility: string;
};

export async function createTodo(
  sb: DB,
  input: CreateTodoInput,
): Promise<Result<void>> {
  const { error } = await sb.rpc("create_todo", {
    p_trip_id: input.tripId,
    p_title: input.title,
    p_priority: input.priority,
    p_kind: input.kind,
    p_visibility: input.visibility,
  });
  if (error) return err(error.message);
  return ok(undefined);
}

export async function setTodoDone(
  sb: DB,
  todoId: string,
  done: boolean,
): Promise<Result<void>> {
  const { error } = await sb.from("todos").update({ done }).eq("id", todoId);
  if (error) return err(error.message);
  return ok(undefined);
}

export async function updateTodo(
  sb: DB,
  todoId: string,
  patch: { title?: string; priority?: string },
): Promise<Result<void>> {
  if (Object.keys(patch).length === 0) return ok(undefined);
  const { error } = await sb.from("todos").update(patch).eq("id", todoId);
  if (error) return err(error.message);
  return ok(undefined);
}

// 消した TODO の控え（restoreTodo にそのまま渡す）。中身は SQL 側が決めるので
// クライアントは列を知らない＝列が増えても控え忘れが起きない。
export type TodoSnapshot = Record<string, unknown>;

// 消して、元の姿を返す。「元に戻す」から書き戻すために使う
// （@triplot/shared/undoable の「逆操作ではなく復元」）。
export async function deleteTodoReturning(
  sb: DB,
  todoId: string,
): Promise<Result<TodoSnapshot>> {
  const { data, error } = await sb.rpc("delete_todo_returning", {
    p_id: todoId,
  });
  if (error) return err(error.message);
  return ok(data as TodoSnapshot);
}

// deleteTodoReturning が返した控えをそのまま書き戻す（id も created_at も
// 元のまま＝予定に紐づく予約TODO の参照も、並び順も、いいねも保たれる）。
export async function restoreTodo(
  sb: DB,
  snapshot: TodoSnapshot,
): Promise<Result<void>> {
  const { error } = await sb.rpc("restore_todo", {
    p_snapshot: snapshot as never,
  });
  if (error) return err(error.message);
  return ok(undefined);
}

export async function deleteTodo(
  sb: DB,
  todoId: string,
): Promise<Result<void>> {
  const { error } = await sb.from("todos").delete().eq("id", todoId);
  if (error) return err(error.message);
  return ok(undefined);
}

// 現地TODO のいいねトグル。RLS で active member 限定。既いいねなら delete、未なら insert。
// トグルの確定状態（liked）を返したいので Result ではなく専用の戻り型。
// error 時の liked は「変化しなかった想定」を返す（楽観 UI の復帰用、元実装と同じ）。
export type ToggleLikeResult =
  | { ok: true; liked: boolean }
  | { ok: false; error: string; liked: boolean };

export async function toggleTodoLike(
  sb: DB,
  tripId: string,
  todoId: string,
  userId: string,
): Promise<ToggleLikeResult> {
  // 自分の member_id を引く
  const { data: meMember } = await sb
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();
  if (!meMember) {
    return {
      ok: false,
      error: "errors.notTripMember",
      liked: false,
    };
  }

  // 既存いいね？
  const { data: existing } = await sb
    .from("todo_likes")
    .select("todo_id")
    .eq("todo_id", todoId)
    .eq("member_id", meMember.id)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from("todo_likes")
      .delete()
      .eq("todo_id", todoId)
      .eq("member_id", meMember.id);
    if (error) return { ok: false, error: error.message, liked: true };
    return { ok: true, liked: false };
  } else {
    const { error } = await sb
      .from("todo_likes")
      .insert({ todo_id: todoId, member_id: meMember.id });
    if (error) return { ok: false, error: error.message, liked: false };
    return { ok: true, liked: true };
  }
}
