"use client";

import {
  useEffect,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { Menu } from "@base-ui/react/menu";
import { Select } from "@base-ui/react/select";

import { toast } from "@/components/toast";
import { useUndoable } from "@/lib/undoable";
import { menuItemClass } from "./menu-item";
import { Button } from "@/components/ui/button";
import { err, ok } from "@triplot/shared/data/result";

import {
  createTodoAction,
  deleteTodoAction,
  restoreTodoAction,
  setTodoAssigneesAction,
  toggleTodoAction,
  toggleTodoLikeAction,
  updateTodoAction,
} from "@/app/trips/[tripId]/actions";
import {
  ChevronIcon,
  CheckIcon,
  EqualIcon,
  HeartIcon,
  LockIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/icons";
import { MemberAvatar } from "@/components/member-avatar";
import { chipStyle } from "@/lib/themeColor";
import { ReservationIcon } from "@/components/reservation-icon";
import { useMediaQuery } from "@/components/use-media-query";
import { sortTodos } from "@triplot/shared/todoSort";
import {
  canCompleteTodo,
  stackOrder,
  todoAssignment,
  todoProgress,
  toggleAssignee,
  type TodoAssignment,
} from "@triplot/shared/todoAssignees";
import type {
  TodoKind,
  TodoPriority,
  Visibility,
} from "@triplot/shared/types/database";
import { PrivateBadge } from "@/components/private-badge";

// 型の単一の真実は shared 側（RN と共用）。既存 import を壊さないよう re-export。
import type { TodoRow } from "@triplot/shared/tripDerive";
export type { TodoRow };

type MemberLite = {
  id: string;
  display_name: string;
  color: number | null;
  avatarUrl?: string | null;
  // 在籍中か。担当者に選べるのは在籍中のメンバーだけ（抜けた人が担当のまま
  // 残っている TODO は、その表示のために一覧に含める）。
  active: boolean;
  // アカウントがあるか（退会したメンバーは担当に数えない）。
  hasAccount: boolean;
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
  | { type: "toggle"; id: string; memberId: string; completed: boolean }
  | { type: "update"; id: string; title?: string; priority?: TodoPriority }
  | {
      type: "assign";
      id: string;
      next: { everyone: boolean; memberIds: string[] };
    }
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
  // （ui-guidelines「部品の作り方」step2）。トリガは優先度アイコンだけ。
  const t = useTranslations("todo");
  const PRIORITY_LABEL: Record<TodoPriority, string> = {
    high: t("priorityHigh"),
    medium: t("priorityMedium"),
    low: t("priorityLow"),
  };
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
            aria-label={t("priorityAriaLabel", { label: PRIORITY_LABEL[value] })}
            title={t("priorityAriaLabel", { label: PRIORITY_LABEL[value] })}
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
          <Select.Popup className="w-24 overflow-hidden rounded-md border border-foreground/20 bg-background py-1 shadow-lg">
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

// 済んだ人の印。アバターを灰色にして暗くし、右上に小さな ✓ を付ける
// （ui-guidelines「TODO の担当」）。色＝まだの人、灰色＋✓＝済んだ人。
function AvatarWithDone({
  member,
  done,
  className,
  style,
}: {
  member: MemberLite;
  done: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`relative inline-flex shrink-0 ${className ?? ""}`} style={style}>
      <MemberAvatar
        name={member.display_name}
        color={member.color}
        imageUrl={member.avatarUrl ?? null}
        className={`ring-[1.5px] ring-background ${done ? "brightness-70 grayscale" : ""}`}
      />
      {done && (
        <span
          aria-hidden
          className="absolute -right-[3px] -top-[3px] flex h-2.5 w-2.5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-[1.5px] ring-background"
        >
          <CheckIcon size={7} />
        </span>
      )}
    </span>
  );
}

// 担当の印（行の右端）。
//   未定 … 破線の丸（広い画面は破線のチップ）
//   1人  … その人のアバター（広い画面は名前の色チップ）
//   複数 … アバターを重ねて並べ、進み具合（全員も一部も同じ形）。まだの人を
//          左・手前に、済んだ人を右・後ろに。並べるのは3人まで、残りは +N。
const STACK_MAX = 3;
function AssigneeMark({
  assignment,
  members,
}: {
  assignment: TodoAssignment;
  members: MemberLite[];
}) {
  const t = useTranslations("todo");
  const byId = new Map(members.map((m) => [m.id, m]));
  const order = stackOrder(assignment).filter((x) => byId.has(x.id));

  if (assignment.mode === "none" || order.length === 0) {
    return (
      <>
        <span
          aria-hidden
          className="inline-block h-[18px] w-[18px] shrink-0 rounded-full border border-dashed border-foreground/40 sm:hidden"
        />
        <span className="hidden shrink-0 rounded-full border border-dashed border-foreground/40 px-2 py-0.5 text-xs font-medium leading-none text-muted-foreground sm:inline-block">
          {t("assigneeNone")}
        </span>
      </>
    );
  }

  if (order.length === 1) {
    const member = byId.get(order[0].id)!;
    return (
      <>
        <MemberAvatar
          name={member.display_name}
          color={member.color}
          imageUrl={member.avatarUrl ?? null}
          className="shrink-0 sm:hidden"
        />
        <span
          style={chipStyle(member.color)}
          className="hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium leading-none sm:inline-block"
        >
          {member.display_name}
        </span>
      </>
    );
  }

  const shown = order.slice(0, STACK_MAX);
  const rest = order.length - shown.length;
  const { done, total } = todoProgress(assignment);
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="flex items-center">
        {shown.map((x, i) => (
          <AvatarWithDone
            key={x.id}
            member={byId.get(x.id)!}
            done={x.done}
            className={i > 0 ? "-ml-1.5" : ""}
            style={{ zIndex: shown.length - i }}
          />
        ))}
        {rest > 0 && (
          <span className="ml-0.5 text-[10px] font-semibold text-muted-foreground">
            +{rest}
          </span>
        )}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {done}/{total}
      </span>
    </span>
  );
}

// 担当の選択。「未定」「全員」と、メンバー（複数選べる）。選ぶたびにその場で
// 保存する（1つ選ぶだけの操作に保存ボタンを置かない。ui-guidelines「保存
// ボタンの要否」）。メンバーは複数選ぶのでメニューを開いたままにする。各メンバー
// には、やったかどうかを行と同じ印で出す（誰がまだかはここで分かる）。
// 選べるのは在籍していてアカウントのある人。抜けた人が担当のままなら、その人も
// 今の値として残す。
function AssigneeMenu({
  assignment,
  members,
  onChange,
}: {
  assignment: TodoAssignment;
  members: MemberLite[];
  onChange: (next: { everyone: boolean; memberIds: string[] }) => void;
}) {
  const t = useTranslations("todo");
  const byId = new Map(members.map((m) => [m.id, m]));
  const options = members.filter(
    (m) =>
      (m.active && m.hasAccount) || assignment.selectedIds.includes(m.id),
  );
  const isOn = (id: string) =>
    assignment.mode === "everyone"
      ? assignment.requiredIds.includes(id)
      : assignment.selectedIds.includes(id);
  const names = stackOrder(assignment)
    .map((x) => byId.get(x.id)?.display_name)
    .filter(Boolean)
    .join("、");
  const label = t("assigneeAria", {
    name:
      assignment.mode === "none"
        ? t("assigneeNone")
        : assignment.mode === "everyone"
          ? t("assigneeEveryone")
          : names,
  });
  const optionClass = (selected: boolean) =>
    `flex w-full items-center gap-2 ${menuItemClass} ${selected ? "bg-accent font-medium" : ""}`;

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={label}
        title={label}
        className="flex shrink-0 items-center rounded-full p-1 transition hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AssigneeMark assignment={assignment} members={members} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4} className="z-50">
          <Menu.Popup className="max-h-64 w-56 overflow-y-auto rounded-md border border-foreground/10 bg-background py-1 text-sm shadow-lg">
            <Menu.Item
              onClick={() => onChange({ everyone: false, memberIds: [] })}
              className={optionClass(assignment.mode === "none")}
            >
              <span
                aria-hidden
                className="inline-block h-[18px] w-[18px] shrink-0 rounded-full border border-dashed border-foreground/40"
              />
              <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
                {t("assigneeNone")}
              </span>
              {assignment.mode === "none" && <CheckIcon size={16} />}
            </Menu.Item>
            <Menu.Item
              onClick={() => onChange({ everyone: true, memberIds: [] })}
              className={optionClass(assignment.mode === "everyone")}
            >
              <UsersIcon size={16} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-left">
                {t("assigneeEveryone")}
              </span>
              {assignment.mode === "everyone" && <CheckIcon size={16} />}
            </Menu.Item>
            <div className="my-1 border-t border-foreground/5" />
            {options.map((m) => (
              <Menu.Item
                key={m.id}
                closeOnClick={false}
                onClick={() => onChange(toggleAssignee(assignment, m.id))}
                className={optionClass(isOn(m.id))}
              >
                <AvatarWithDone
                  member={m}
                  done={assignment.completedIds.includes(m.id)}
                />
                <span className="min-w-0 flex-1 truncate text-left">
                  {m.display_name}
                </span>
                {isOn(m.id) && <CheckIcon size={16} />}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
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
  const t = useTranslations("todo");
  const placeholder = t("placeholderAdd");

  // 折りたたみ: 既定はフェーズ由来(defaultCollapsed)だが、適用するのは広い画面
  // だけ。狭い画面（タブ表示）は TODO タブを開いた人が見に来ているので常に開く
  // （trip-detail-tabs と同じ md ブレークポイントで判定）。手動で開閉したら
  // localStorage に覚え、次回以降は既定より優先する。
  const isWide = useMediaQuery("(min-width: 768px)");
  const storageKey = `triplot.todoCollapsed.${tripId}.${kind}`;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  // localStorage はクライアント専用。SSR/初回描画は defaultCollapsed で揃え、
  // マウント後に保存値があればそれに、狭い画面なら「開」に同期する
  // （hydration 不一致を避ける正当な用途）。
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
    } else if (!isWide) {
      setCollapsed(false);
    }
  }, [storageKey, isWide]);
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
  // 再取得は各アクションの revalidatePath が行うので、ここでは何もしない
  // （useUndoable はトーストと復元の手順だけを担う）。
  const runUndoable = useUndoable(() => {});
  const [optimisticTodos, applyOptimistic] = useOptimistic(
    todos,
    (state, action: OptimisticAction): TodoRow[] => {
      switch (action.type) {
        case "add":
          return [...state, action.todo];
        // 自分の分だけ付け外しする。全体の完了（done）は再取得で DB の値に揃う。
        case "toggle":
          return state.map((t) =>
            t.id === action.id
              ? {
                  ...t,
                  completedIds: action.completed
                    ? [...t.completedIds, action.memberId]
                    : t.completedIds.filter((m) => m !== action.memberId),
                }
              : t,
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
        case "assign":
          return state.map((t) =>
            t.id === action.id
              ? {
                  ...t,
                  assigneeEveryone: action.next.everyone,
                  assigneeIds: action.next.everyone ? [] : action.next.memberIds,
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
  // 追加時の公開範囲。既定は公開（共有）。鍵トグルで private に。
  const [draftVisibility, setDraftVisibility] = useState<Visibility>("shared");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const assignmentOf = (todo: TodoRow) =>
    todoAssignment(
      {
        assigneeEveryone: todo.assigneeEveryone,
        assigneeIds: todo.assigneeIds,
        completedIds: todo.completedIds,
      },
      members,
    );

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
      assigneeEveryone: false,
      assigneeIds: [myMemberId],
      completedIds: [],
      kind,
      event_id: null,
      visibility: draftVisibility,
      likeCount: 0,
      iLiked: false,
    };
    setDraft("");
    setDraftVisibility("shared"); // 次回の追加は既定の公開に戻す
    startTransition(async () => {
      applyOptimistic({ type: "add", todo: temp });
      const { error } = await createTodoAction(
        tripId,
        title,
        draftPriority,
        kind,
        draftVisibility,
      );
      if (error) toast(t("failed", { error }));
    });
  };

  // チェックは自分の分（やった／やっていない）。
  const toggle = (todo: TodoRow) => {
    const completed = !todo.completedIds.includes(myMemberId);
    startTransition(async () => {
      applyOptimistic({
        type: "toggle",
        id: todo.id,
        memberId: myMemberId,
        completed,
      });
      const { error } = await toggleTodoAction(
        tripId,
        todo.id,
        myMemberId,
        completed,
      );
      if (error) toast(t("failed", { error }));
    });
  };

  const changePriority = (todo: TodoRow, priority: TodoPriority) => {
    if (priority === todo.priority) return;
    startTransition(async () => {
      applyOptimistic({ type: "update", id: todo.id, priority });
      const { error } = await updateTodoAction(tripId, todo.id, { priority });
      if (error) toast(t("failed", { error }));
    });
  };

  const changeAssignees = (
    todo: TodoRow,
    next: { everyone: boolean; memberIds: string[] },
  ) => {
    startTransition(async () => {
      applyOptimistic({ type: "assign", id: todo.id, next });
      const { error } = await setTodoAssigneesAction(tripId, todo.id, next);
      if (error) toast(t("failed", { error }));
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
    const current = todos.find((td) => td.id === id);
    // 変更なし・空入力は保存しない（空は削除ではなく編集キャンセル扱い）
    if (!current || !text || text === current.title) return;
    startTransition(async () => {
      applyOptimistic({ type: "update", id, title: text });
      const { error } = await updateTodoAction(tripId, id, { title: text });
      if (error) toast(t("failed", { error }));
    });
  };

  // 確認は出さない。**トーストから元に戻せる**ので、確認とアンドゥのどちらか
  // 一方という規則の「アンドゥ側」を採る（ui-guidelines「確認の要否は復旧
  // コストで決める」）。消した姿は id も created_at もいいねも丸ごと控えて
  // あるので、書き戻せば参照も並び順も保たれる。
  const onDelete = (todo: TodoRow) => {
    runUndoable({
      apply: async () => {
        applyOptimistic({ type: "delete", id: todo.id });
        const { error, snapshot } = await deleteTodoAction(tripId, todo.id);
        return error || !snapshot ? err(error ?? "") : ok(snapshot);
      },
      restore: async (snapshot) => {
        const { error } = await restoreTodoAction(tripId, snapshot);
        return error ? err(error) : ok(undefined);
      },
      done: t("deleted"),
      failed: (error) => t("failed", { error }),
    });
  };

  const toggleLike = (todo: TodoRow) => {
    startTransition(async () => {
      applyOptimistic({ type: "like", id: todo.id, liked: !todo.iLiked });
      const { error } = await toggleTodoLikeAction(tripId, todo.id);
      if (error) toast(t("failed", { error }));
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
        {/* 件数は括弧付き（ui-guidelines「見出しに添える件数」）。裸の数字だと
            見出しの続きに読める。0 のときは出さない — 開けば空のリストと追加欄が
            見えるので、同じことを二度言うことになる。RN の todos.tsx と同じ形。 */}
        {ordered.length > 0 && (
          <span className="font-normal text-subtle-foreground">
            ({ordered.length})
          </span>
        )}
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
        {/* 公開範囲トグル（優先度の左）。既定は公開＝グレーアウトの鍵、押すと private＝濃い鍵。 */}
        <Button
          type="button"
          variant="ghost"
          size="iconDense"
          onClick={() =>
            setDraftVisibility((v) => (v === "private" ? "shared" : "private"))
          }
          aria-pressed={draftVisibility === "private"}
          aria-label={
            draftVisibility === "private"
              ? t("visibilityPrivate")
              : t("visibilityShared")
          }
          title={
            draftVisibility === "private"
              ? t("visibilityPrivate")
              : t("visibilityShared")
          }
          className="shrink-0 rounded-full"
        >
          <LockIcon
            size={16}
            filled={draftVisibility === "private"}
            className={
              draftVisibility === "private"
                ? "text-foreground"
                : "text-subtle-foreground"
            }
          />
        </Button>
        <PrioritySelect value={draftPriority} onChange={setDraftPriority} />
        <Button
          type="button"
          size="iconSm"
          onClick={add}
          disabled={isPending || draft.trim() === ""}
          aria-label={t("addAria")}
          className="shrink-0"
        >
          <PlusIcon size={16} />
        </Button>
      </div>

      {/* リスト */}
      {ordered.length === 0 ? null : (
        <ul>
          {ordered.map((todo) => {
            const assignment = assignmentOf(todo);
            // チェックは「自分がやったか」。担当でない人は押せない（全体の完了を
            // 見せるだけ）。未定は誰がやっても完了なので全体の完了を見せ、
            // 外せるのはやった本人だけ。
            const mine = todo.completedIds.includes(myMemberId);
            const canCheck = canCompleteTodo(assignment, myMemberId);
            const checked =
              canCheck && assignment.mode !== "none" ? mine : todo.done;
            const disabled =
              !canCheck || (assignment.mode === "none" && todo.done && !mine);
            return (
            <li
              key={todo.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-foreground/10"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(todo)}
                aria-label={checked ? t("checkUndone") : t("checkDone")}
                className="size-[18px] shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              />

              {/* 行の並びは「左=読む情報（優先度・タイトル・鍵・担当者）／
                  右端=押すもの（♥・削除）」のグループ分け。優先度は押して
                  変更できるが本質は状態表示なので左（Jira/Linear と同じ）。 */}
              <PrioritySelect
                value={todo.priority}
                onChange={(p) => changePriority(todo, p)}
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
                  <div className="flex items-center gap-1.5">
                    <span
                      onClick={() => startEdit(todo)}
                      className={`min-w-0 cursor-text truncate text-sm ${
                        todo.done
                          ? "text-subtle-foreground line-through"
                          : "text-foreground"
                      }`}
                    >
                      {todo.event_id && (
                        <ReservationIcon size={16} className="mr-1" />
                      )}
                      {todo.title}
                    </span>
                    {todo.visibility === "private" && (
                      <PrivateBadge className="shrink-0" />
                    )}
                  </div>
                )}
              </div>

              {/* 担当者。**行のトップレベルに置く**（タイトル側に入れるとタイトルの
                  長さで位置がガタつく。iOS と同形）。自分だけの TODO は担当が
                  本人に決まっているので、選択を出さず印だけ。 */}
              {editingId !== todo.id && (
                // 全体が完了した TODO は、取り消し線と揃えて印もまとめて控えめに。
                <span className={todo.done ? "opacity-50" : ""}>
                  {todo.visibility === "private" ? (
                    <span className="flex shrink-0 items-center p-1">
                      <AssigneeMark assignment={assignment} members={members} />
                    </span>
                  ) : (
                    <AssigneeMenu
                      assignment={assignment}
                      members={members}
                      onChange={(next) => changeAssignees(todo, next)}
                    />
                  )}
                </span>
              )}

              {/* いいねは現地TODOだけ。1人1いいねで再タップ取り消し。 */}
              {kind === "onsite" && (
                <>
                  <button
                    type="button"
                    onClick={() => toggleLike(todo)}
                    aria-label={todo.iLiked ? t("likeRemove") : t("like")}
                    aria-pressed={todo.iLiked}
                    title={todo.iLiked ? t("likeRemove") : t("like")}
                    className={`shrink-0 rounded p-1 transition ${
                      todo.iLiked
                        ? "text-rose-500 hover:bg-rose-500/10"
                        : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                    }`}
                  >
                    <HeartIcon size={16} filled={todo.iLiked} />
                  </button>
                  {/* いいね数は ♥ と削除の間の固定幅スロットに常時確保する。
                      数字の有無で ♥ の位置が動かず、空きスロットが誤タップ分離の
                      余白（♥→削除のタップ領域間 約32px）を兼ねる。 */}
                  <span
                    aria-hidden
                    className="w-4 shrink-0 text-left text-xs tabular-nums text-muted-foreground"
                  >
                    {todo.likeCount > 0 ? todo.likeCount : ""}
                  </span>
                </>
              )}

              <button
                type="button"
                onClick={() => onDelete(todo)}
                aria-label={t("deleteAria")}
                className="shrink-0 rounded p-1 text-red-600 transition hover:bg-red-600/10"
              >
                <TrashIcon size={16} />
              </button>
            </li>
          );
          })}
        </ul>
      )}
        </>
      )}
    </div>
  );
}
