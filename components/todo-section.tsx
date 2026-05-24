"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";

import {
  createTodoAction,
  deleteTodoAction,
  toggleTodoAction,
  updateTodoAction,
} from "@/app/trips/[tripId]/actions";
import { ChevronIcon, CheckIcon, TrashIcon } from "@/components/icons";
import { sortTodos } from "@/lib/todoSort";
import type { TodoKind, TodoPriority } from "@/lib/types/database";

export type TodoRow = {
  id: string;
  title: string;
  priority: TodoPriority;
  done: boolean;
  created_at: string;
  created_by_member_id: string;
  kind: TodoKind;
  // 予定に紐づく予約TODOなら event_id が入る（null=通常TODO）。
  event_id: string | null;
};

type MemberLite = {
  id: string;
  display_name: string;
  color: string | null;
};

// 優先度チップの配色（ライトモード固定）
const PRIORITY_CHIP: Record<TodoPriority, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-zinc-100 text-zinc-600",
};

type OptimisticAction =
  | { type: "add"; todo: TodoRow }
  | { type: "toggle"; id: string; done: boolean }
  | { type: "update"; id: string; title?: string; priority?: TodoPriority }
  | { type: "delete"; id: string };

function PrioritySelect({
  value,
  onChange,
  disabled,
}: {
  value: TodoPriority;
  onChange: (p: TodoPriority) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TodoPriority)}
      disabled={disabled}
      aria-label="優先度"
      className={`shrink-0 cursor-pointer appearance-none rounded-full px-2 py-0.5 text-center text-xs font-medium outline-none disabled:opacity-50 ${PRIORITY_CHIP[value]}`}
    >
      <option value="high">高</option>
      <option value="medium">中</option>
      <option value="low">低</option>
    </select>
  );
}

export function TodoSection({
  tripId,
  kind,
  title,
  defaultCollapsed,
  todos,
  members,
  myMemberId,
}: {
  tripId: string;
  kind: TodoKind;
  title: string;
  // フェーズ由来の既定折りたたみ（例: 準備は旅行開始以降は畳む）。
  defaultCollapsed: boolean;
  todos: TodoRow[];
  members: MemberLite[];
  myMemberId: string;
}) {
  const placeholder =
    kind === "prep" ? "準備することを追加" : "現地ですることを追加";

  // 折りたたみ: 既定はフェーズ由来(defaultCollapsed)。手動で開閉したら
  // localStorage に覚え、次回以降は既定より優先する。
  const storageKey = `triplot.todoCollapsed.${tripId}.${kind}`;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  // localStorage はクライアント専用。SSR/初回描画は defaultCollapsed で揃え、
  // マウント後に保存値があればそれに同期する（hydration 不一致を避ける正当な用途）。
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey);
    } catch {
      saved = null; // localStorage 不可環境は既定のまま
    }
    if (saved === "1" || saved === "0") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部ストア同期
      setCollapsed(saved === "1");
    }
  }, [storageKey]);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // 保存失敗は無視（状態だけ反映）
      }
      return next;
    });
  };
  const [isPending, startTransition] = useTransition();
  const [optimisticTodos, applyOptimistic] = useOptimistic(
    todos,
    (state, action: OptimisticAction): TodoRow[] => {
      switch (action.type) {
        case "add":
          return [...state, action.todo];
        case "toggle":
          return state.map((t) =>
            t.id === action.id ? { ...t, done: action.done } : t,
          );
        case "update":
          return state.map((t) =>
            t.id === action.id
              ? {
                  ...t,
                  ...(action.title !== undefined ? { title: action.title } : {}),
                  ...(action.priority !== undefined
                    ? { priority: action.priority }
                    : {}),
                }
              : t,
          );
        case "delete":
          return state.filter((t) => t.id !== action.id);
      }
    },
  );

  const [draft, setDraft] = useState("");
  const [draftPriority, setDraftPriority] = useState<TodoPriority>("medium");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.display_name ?? "?";
  const memberColor = (id: string) =>
    members.find((m) => m.id === id)?.color ?? "#a1a1aa";

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    const temp: TodoRow = {
      id: crypto.randomUUID(),
      title,
      priority: draftPriority,
      done: false,
      created_at: new Date().toISOString(),
      created_by_member_id: myMemberId,
      kind,
      event_id: null,
    };
    setDraft("");
    startTransition(async () => {
      applyOptimistic({ type: "add", todo: temp });
      const { error } = await createTodoAction(
        tripId,
        title,
        draftPriority,
        kind,
      );
      if (error) alert(`失敗しました: ${error}`);
    });
  };

  const toggle = (todo: TodoRow) => {
    startTransition(async () => {
      applyOptimistic({ type: "toggle", id: todo.id, done: !todo.done });
      const { error } = await toggleTodoAction(tripId, todo.id, !todo.done);
      if (error) alert(`失敗しました: ${error}`);
    });
  };

  const changePriority = (todo: TodoRow, priority: TodoPriority) => {
    if (priority === todo.priority) return;
    startTransition(async () => {
      applyOptimistic({ type: "update", id: todo.id, priority });
      const { error } = await updateTodoAction(tripId, todo.id, { priority });
      if (error) alert(`失敗しました: ${error}`);
    });
  };

  const startEdit = (todo: TodoRow) => {
    setEditingId(todo.id);
    setEditingText(todo.title);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const id = editingId;
    const text = editingText.trim();
    setEditingId(null);
    const current = todos.find((t) => t.id === id);
    // 変更なし・空入力は保存しない（空は削除ではなく編集キャンセル扱い）
    if (!current || !text || text === current.title) return;
    startTransition(async () => {
      applyOptimistic({ type: "update", id, title: text });
      const { error } = await updateTodoAction(tripId, id, { title: text });
      if (error) alert(`失敗しました: ${error}`);
    });
  };

  const remove = (todo: TodoRow) => {
    if (!confirm("このTODOを削除しますか？")) return;
    startTransition(async () => {
      applyOptimistic({ type: "delete", id: todo.id });
      const { error } = await deleteTodoAction(tripId, todo.id);
      if (error) alert(`失敗しました: ${error}`);
    });
  };

  const ordered = sortTodos(optimisticTodos);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1 text-left text-sm font-semibold text-zinc-700"
      >
        <ChevronIcon
          size={16}
          className={`shrink-0 text-zinc-400 transition-transform ${
            collapsed ? "" : "rotate-90"
          }`}
        />
        {title}
      </button>

      {!collapsed && (
        <>
          {/* 追加 */}
          <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // 日本語入力中（変換確定）の Enter は拾わない。確定後の Enter だけで追加。
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-md border border-zinc-200 px-3 py-1.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400"
        />
        <PrioritySelect value={draftPriority} onChange={setDraftPriority} />
        <button
          type="button"
          onClick={add}
          disabled={isPending || draft.trim() === ""}
          className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40"
        >
          追加
        </button>
      </div>

      {/* リスト */}
      {ordered.length === 0 ? (
        <p className="px-2 py-1 text-sm text-zinc-400">まだありません</p>
      ) : (
        <ul>
          {ordered.map((todo) => (
            <li
              key={todo.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-50"
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={todo.done}
                aria-label={todo.done ? "未完了に戻す" : "完了にする"}
                onClick={() => toggle(todo)}
                className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition ${
                  todo.done
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-zinc-300 bg-white hover:border-zinc-400"
                }`}
              >
                {todo.done && <CheckIcon size={12} />}
              </button>

              <div className="min-w-0 flex-1">
                {editingId === todo.id ? (
                  <input
                    autoFocus
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      // 変換確定の Enter / Esc は IME 側の操作なので拾わない
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitEdit();
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="w-full bg-transparent text-sm outline-none"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(todo)}
                    className={`block cursor-text truncate text-sm ${
                      todo.done
                        ? "text-zinc-400 line-through"
                        : "text-zinc-800"
                    }`}
                  >
                    {todo.event_id && (
                      <span className="mr-1" aria-hidden>
                        🎫
                      </span>
                    )}
                    {todo.title}
                  </span>
                )}
              </div>

              <PrioritySelect
                value={todo.priority}
                onChange={(p) => changePriority(todo, p)}
              />

              <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-400">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: memberColor(todo.created_by_member_id),
                  }}
                />
                <span className="hidden sm:inline">
                  {memberName(todo.created_by_member_id)}
                </span>
              </span>

              <button
                type="button"
                onClick={() => remove(todo)}
                aria-label="削除"
                className="shrink-0 rounded p-1 text-zinc-300 transition hover:bg-zinc-200 hover:text-zinc-600"
              >
                <TrashIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
        </>
      )}
    </div>
  );
}
