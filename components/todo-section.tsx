"use client";

import {
  useEffect,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { Select } from "@base-ui/react/select";

import { toast } from "@/components/toast";
import { menuItemClass } from "./menu-item";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/confirm-dialog";

import {
  createTodoAction,
  deleteTodoAction,
  toggleTodoAction,
  toggleTodoLikeAction,
  updateTodoAction,
} from "@/app/trips/[tripId]/actions";
import {
  ChevronIcon,
  CheckIcon,
  EqualIcon,
  HeartIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { MemberAvatar } from "@/components/member-avatar";
import { ReservationIcon } from "@/components/reservation-icon";
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
  // 現地TODO のいいね（prep は常に 0/false）。
  likeCount: number;
  iLiked: boolean;
};

type MemberLite = {
  id: string;
  display_name: string;
  color: number | null;
};

// 優先度チップの配色（ライトモード固定）
const PRIORITY_LABEL: Record<TodoPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

// JIRA 風の優先度アイコン（高=上シェブロン / 中=イコール / 低=下シェブロン）。
// 既存の Lucide Chevron を回転して再利用し、色＋形状で色覚にも配慮する。
function PriorityIcon({ p, size = 16 }: { p: TodoPriority; size?: number }) {
  if (p === "high")
    return <ChevronIcon size={size} className="-rotate-90 text-red-500" />;
  if (p === "low")
    return <ChevronIcon size={size} className="rotate-90 text-blue-500" />;
  return <EqualIcon size={size} className="text-amber-500" />;
}

type OptimisticAction =
  | { type: "add"; todo: TodoRow }
  | { type: "toggle"; id: string; done: boolean }
  | { type: "update"; id: string; title?: string; priority?: TodoPriority }
  | { type: "delete"; id: string }
  | { type: "like"; id: string; liked: boolean };

function PrioritySelect({
  value,
  onChange,
  disabled,
}: {
  value: TodoPriority;
  onChange: (p: TodoPriority) => void;
  disabled?: boolean;
}) {
  // 開閉・外側クリック・Esc・キーボードは Base UI Select に委ねる
  // （design-guidelines「部品の作り方」step2）。トリガは優先度アイコンだけ。
  return (
    <Select.Root
      value={value}
      onValueChange={(v) => onChange(v as TodoPriority)}
      disabled={disabled}
    >
      <Select.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="iconDense"
            disabled={disabled}
            aria-label={`優先度: ${PRIORITY_LABEL[value]}`}
            title={`優先度: ${PRIORITY_LABEL[value]}`}
            className="shrink-0 rounded-full"
          >
            <PriorityIcon p={value} />
          </Button>
        }
      />
      <Select.Portal>
        <Select.Positioner
          align="end"
          sideOffset={4}
          alignItemWithTrigger={false}
          className="z-50"
        >
          <Select.Popup className="w-24 overflow-hidden rounded-md border border-foreground/20 bg-white py-1 shadow-lg">
            {(["high", "medium", "low"] as const).map((p) => (
              <Select.Item
                key={p}
                value={p}
                className={`flex items-center gap-2 ${menuItemClass} data-[selected]:bg-accent data-[selected]:font-medium`}
              >
                <PriorityIcon p={p} />
                <Select.ItemText className="flex-1">
                  {PRIORITY_LABEL[p]}
                </Select.ItemText>
                <Select.ItemIndicator className="text-muted-foreground">
                  <CheckIcon size={16} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
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
    kind === "prep" ? "航空券の予約" : "両親にお土産買う";

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
        case "like":
          return state.map((t) =>
            t.id === action.id
              ? {
                  ...t,
                  iLiked: action.liked,
                  likeCount: t.likeCount + (action.liked ? 1 : -1),
                }
              : t,
          );
      }
    },
  );

  const [draft, setDraft] = useState("");
  const [draftPriority, setDraftPriority] = useState<TodoPriority>("medium");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const memberOf = (id: string) => members.find((m) => m.id === id);
  const memberName = (id: string) => memberOf(id)?.display_name ?? "?";
  const memberColor = (id: string) => memberOf(id)?.color ?? null;

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
      likeCount: 0,
      iLiked: false,
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
      if (error) toast(`失敗しました: ${error}`);
    });
  };

  const toggle = (todo: TodoRow) => {
    startTransition(async () => {
      applyOptimistic({ type: "toggle", id: todo.id, done: !todo.done });
      const { error } = await toggleTodoAction(tripId, todo.id, !todo.done);
      if (error) toast(`失敗しました: ${error}`);
    });
  };

  const changePriority = (todo: TodoRow, priority: TodoPriority) => {
    if (priority === todo.priority) return;
    startTransition(async () => {
      applyOptimistic({ type: "update", id: todo.id, priority });
      const { error } = await updateTodoAction(tripId, todo.id, { priority });
      if (error) toast(`失敗しました: ${error}`);
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
      if (error) toast(`失敗しました: ${error}`);
    });
  };

  const remove = async (todo: TodoRow) => {
    if (!(await confirmDialog({ title: "このTODOを削除しますか？" }))) return;
    startTransition(async () => {
      applyOptimistic({ type: "delete", id: todo.id });
      const { error } = await deleteTodoAction(tripId, todo.id);
      if (error) toast(`失敗しました: ${error}`);
    });
  };

  const toggleLike = (todo: TodoRow) => {
    startTransition(async () => {
      applyOptimistic({ type: "like", id: todo.id, liked: !todo.iLiked });
      const { error } = await toggleTodoLikeAction(tripId, todo.id);
      if (error) toast(`失敗しました: ${error}`);
    });
  };

  const ordered = sortTodos(optimisticTodos);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1 text-left text-sm font-semibold text-muted-foreground"
      >
        <ChevronIcon
          size={16}
          className={`shrink-0 text-subtle-foreground transition-transform ${
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
          className="min-w-0 flex-1 rounded-md border border-foreground/10 px-3 py-1.5 text-sm outline-none placeholder:text-subtle-foreground focus:border-primary"
        />
        <PrioritySelect value={draftPriority} onChange={setDraftPriority} />
        <Button
          type="button"
          size="iconSm"
          onClick={add}
          disabled={isPending || draft.trim() === ""}
          aria-label="追加"
          className="shrink-0"
        >
          <PlusIcon size={16} />
        </Button>
      </div>

      {/* リスト */}
      {ordered.length === 0 ? null : (
        <ul>
          {ordered.map((todo) => (
            <li
              key={todo.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-foreground/10"
            >
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => toggle(todo)}
                aria-label={todo.done ? "未完了に戻す" : "完了にする"}
                className="size-[18px] shrink-0 cursor-pointer"
              />

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
                        ? "text-subtle-foreground line-through"
                        : "text-foreground"
                    }`}
                  >
                    {todo.event_id && <ReservationIcon size={16} className="mr-1" />}
                    {todo.title}
                  </span>
                )}
              </div>

              <PrioritySelect
                value={todo.priority}
                onChange={(p) => changePriority(todo, p)}
              />

              {/* いいねは現地TODOだけ。1人1いいねで再タップ取り消し。 */}
              {kind === "onsite" && (
                <button
                  type="button"
                  onClick={() => toggleLike(todo)}
                  aria-label={todo.iLiked ? "いいねを取り消す" : "いいね"}
                  aria-pressed={todo.iLiked}
                  title={todo.iLiked ? "いいねを取り消す" : "いいね"}
                  className={`flex shrink-0 items-center gap-0.5 rounded p-1 text-xs transition ${
                    todo.iLiked
                      ? "text-rose-500 hover:bg-rose-500/10"
                      : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  }`}
                >
                  <HeartIcon size={16} filled={todo.iLiked} />
                  {todo.likeCount > 0 && (
                    <span className="tabular-nums">{todo.likeCount}</span>
                  )}
                </button>
              )}

              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <MemberAvatar
                  name={memberName(todo.created_by_member_id)}
                  color={memberColor(todo.created_by_member_id)}
                />
                <span>{memberName(todo.created_by_member_id)}</span>
              </span>

              <button
                type="button"
                onClick={() => remove(todo)}
                aria-label="削除"
                className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
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
