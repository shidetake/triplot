import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import { avatarStyle, firstChar } from "@triplot/shared/memberColors";
import {
  createTodo,
  deleteTodo,
  setTodoDone,
  toggleTodoLike,
  updateTodo,
} from "@triplot/shared/data/todos";
import { sortTodos } from "@triplot/shared/todoSort";
import { deriveTodos, type TodoRow } from "@triplot/shared/tripDerive";
import type { TodoKind, TodoPriority } from "@triplot/shared/types/database";

import {
  CheckIcon,
  ChevronIcon,
  EqualIcon,
  HeartIcon,
  LockIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { useInvalidateTrip, useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// TODO タブ。web の components/todo-section.tsx 相当（準備/現地の2セクション、
// チェック・いいねは楽観更新、他は invalidate で再取得）。

// 優先度アイコン: 高=赤↑ / 中=黄= / 低=青↓（web の PriorityIcon と同じ
// Jira 慣例の三つ組。同じ鮮やかさ 500 で揃える）。
const PRIORITY_COLORS: Record<TodoPriority, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#3b82f6",
};
const PRIORITY_CYCLE: TodoPriority[] = ["high", "medium", "low"];

function PriorityIcon({ priority }: { priority: TodoPriority }) {
  const color = PRIORITY_COLORS[priority];
  if (priority === "medium") return <EqualIcon size={16} color={color} />;
  return (
    <ChevronIcon size={16} color={color} rotate={priority === "high" ? -90 : 90} />
  );
}

type MemberLite = {
  id: string;
  display_name: string;
  color: number | null;
  avatarUrl: string | null;
};

export default function TodosTab() {
  const tripId = useTripId();
  const t = useTranslations();
  const styles = useThemedStyles(makeStyles);
  const { data, me, userId, refetch } = useTripDetail(tripId);
  const { refreshing, onRefresh } = usePullRefresh(refetch);

  if (!data?.trip || !me) return null;

  const todos = deriveTodos(data.todosRaw, me.id);
  const members: MemberLite[] = (data.members ?? []).map((m) => ({
    id: m.id,
    display_name: m.display_name,
    color: m.color,
    avatarUrl: m.users?.avatar_url ?? null,
  }));
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* タブ自体が「TODO」なので画面内見出しは重複＝出さない。準備TODOも
          タブ表示では常に開いて出す（旅行開始後に畳むのは web の広い画面だけ）。 */}
      <TodoSection
        tripId={tripId}
        kind="prep"
        title={t("tripDetail.todoPrep")}
        defaultCollapsed={false}
        todos={todos.filter((x) => x.kind === "prep")}
        members={members}
        myMemberId={me.id}
        userId={userId!}
      />
      <TodoSection
        tripId={tripId}
        kind="onsite"
        title={t("tripDetail.todoOnsite")}
        defaultCollapsed={false}
        todos={todos.filter((x) => x.kind === "onsite")}
        members={members}
        myMemberId={me.id}
        userId={userId!}
      />
    </ScrollView>
  );
}

function TodoSection({
  tripId,
  kind,
  title,
  defaultCollapsed,
  todos,
  members,
  myMemberId,
  userId,
}: {
  tripId: string;
  kind: TodoKind;
  title: string;
  defaultCollapsed: boolean;
  todos: TodoRow[];
  members: MemberLite[];
  myMemberId: string;
  userId: string;
}) {
  const t = useTranslations("todo");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const invalidate = useInvalidateTrip(tripId);
  const memberById = new Map(members.map((m) => [m.id, m]));

  // 折りたたみ既定はフェーズ由来（旅行開始後は準備を畳む。web と同じ）。
  // web は localStorage に手動開閉を覚えるが、RN は M3 では画面内状態のみ。
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const [draft, setDraft] = useState("");
  const [draftPriority, setDraftPriority] = useState<TodoPriority>("medium");
  const [draftPrivate, setDraftPrivate] = useState(false);

  const fail = (error: string) => Alert.alert(t("failed", { error }));

  const addMutation = useMutation({
    mutationFn: async () => {
      const title = draft.trim();
      if (!title) return;
      const r = await createTodo(supabase, {
        tripId,
        title,
        priority: draftPriority,
        kind,
        visibility: draftPrivate ? "private" : "shared",
      });
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      setDraft("");
      void invalidate();
    },
    onError: (e) => fail(String(e)),
  });

  const doneMutation = useMutation({
    mutationFn: async (v: { id: string; done: boolean }) => {
      const r = await setTodoDone(supabase, v.id, v.done);
      if (!r.ok) throw new Error(r.error);
    },
    onSettled: () => void invalidate(),
    onError: (e) => fail(String(e)),
  });

  const likeMutation = useMutation({
    mutationFn: async (todoId: string) => {
      const r = await toggleTodoLike(supabase, tripId, todoId, userId);
      if (!r.ok) throw new Error(r.error);
    },
    onSettled: () => void invalidate(),
    onError: (e) => fail(String(e)),
  });

  const editTitle = (todo: TodoRow) => {
    Alert.prompt(
      todo.title,
      undefined,
      async (next) => {
        const trimmed = (next ?? "").trim();
        if (!trimmed || trimmed === todo.title) return;
        const r = await updateTodo(supabase, todo.id, { title: trimmed });
        if (!r.ok) fail(r.error);
        void invalidate();
      },
      "plain-text",
      todo.title,
    );
  };

  const cyclePriority = async (todo: TodoRow) => {
    const next =
      PRIORITY_CYCLE[
        (PRIORITY_CYCLE.indexOf(todo.priority) + 1) % PRIORITY_CYCLE.length
      ];
    const r = await updateTodo(supabase, todo.id, { priority: next });
    if (!r.ok) fail(r.error);
    void invalidate();
  };

  const confirmDelete = (todo: TodoRow) => {
    Alert.alert(t("deleteTitle"), undefined, [
      { text: "キャンセル", style: "cancel" },
      {
        text: t("deleteAria"),
        style: "destructive",
        onPress: () => {
          void deleteTodo(supabase, todo.id).then((r) => {
            if (!r.ok) fail(r.error);
            void invalidate();
          });
        },
      },
    ]);
  };

  const sorted = sortTodos(todos);

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setCollapsed((c) => !c)}
        style={styles.sectionHeader}
      >
        <ChevronIcon size={16} color={theme.mutedForeground} rotate={collapsed ? 0 : 90} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{todos.length}</Text>
      </Pressable>

      {!collapsed && (
        <>
          {/* 追加行 */}
          <View style={styles.addRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={
                kind === "prep" ? t("placeholderPrep") : t("placeholderOnsite")
              }
              placeholderTextColor={theme.subtleForeground}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={() => addMutation.mutate()}
            />
            <Pressable
              onPress={() => setDraftPrivate((v) => !v)}
              hitSlop={8}
              accessibilityLabel={
                draftPrivate ? t("visibilityPrivate") : t("visibilityShared")
              }
              style={styles.iconButton}
            >
              <LockIcon
                size={16}
                color={draftPrivate ? theme.foreground : theme.subtleForeground}
              />
            </Pressable>
            <Pressable
              onPress={() =>
                setDraftPriority(
                  (p) =>
                    PRIORITY_CYCLE[
                      (PRIORITY_CYCLE.indexOf(p) + 1) % PRIORITY_CYCLE.length
                    ],
                )
              }
              hitSlop={8}
              style={styles.iconButton}
            >
              <PriorityIcon priority={draftPriority} />
            </Pressable>
            <Pressable
              onPress={() => addMutation.mutate()}
              disabled={addMutation.isPending || draft.trim() === ""}
              hitSlop={8}
              accessibilityLabel={t("addAria")}
              style={[
                styles.addButton,
                (addMutation.isPending || draft.trim() === "") &&
                  styles.disabled,
              ]}
            >
              <PlusIcon size={16} color={theme.primaryForeground} />
            </Pressable>
          </View>

          {/* リスト */}
          {sorted.map((todo) => {
            const creator = memberById.get(todo.created_by_member_id);
            return (
              <View key={todo.id} style={styles.row}>
                <Pressable
                  onPress={() =>
                    doneMutation.mutate({ id: todo.id, done: !todo.done })
                  }
                  hitSlop={8}
                  accessibilityLabel={
                    todo.done ? t("checkUndone") : t("checkDone")
                  }
                  style={[styles.checkbox, todo.done && styles.checkboxDone]}
                >
                  {todo.done && <CheckIcon size={13} color={theme.primaryForeground} />}
                </Pressable>

                <Pressable onPress={() => void cyclePriority(todo)} hitSlop={8}>
                  <PriorityIcon priority={todo.priority} />
                </Pressable>

                <Pressable
                  onPress={() => editTitle(todo)}
                  style={styles.titleArea}
                >
                  <Text
                    style={[styles.title, todo.done && styles.titleDone]}
                    numberOfLines={2}
                  >
                    {todo.title}
                  </Text>
                </Pressable>

                {todo.visibility === "private" && (
                  <LockIcon size={14} color={theme.mutedForeground} />
                )}

                {creator && <Avatar member={creator} />}

                {kind === "onsite" && (
                  <Pressable
                    onPress={() => likeMutation.mutate(todo.id)}
                    hitSlop={8}
                    accessibilityLabel={todo.iLiked ? t("likeRemove") : t("like")}
                    style={styles.likeArea}
                  >
                    <HeartIcon
                      size={15}
                      color={todo.iLiked ? "#f43f5e" : theme.subtleForeground}
                      filled={todo.iLiked}
                    />
                    {todo.likeCount > 0 && (
                      <Text style={styles.likeCount}>{todo.likeCount}</Text>
                    )}
                  </Pressable>
                )}

                <Pressable
                  onPress={() => confirmDelete(todo)}
                  hitSlop={8}
                  accessibilityLabel={t("deleteAria")}
                >
                  <TrashIcon size={15} color={theme.subtleForeground} />
                </Pressable>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

// 色丸＋頭文字（web の MemberAvatar 相当。写真があれば写真）。
function Avatar({ member }: { member: MemberLite }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (member.avatarUrl) {
    return <Image source={{ uri: member.avatarUrl }} style={styles.avatar} />;
  }
  const s = avatarStyle(member.color) as {
    backgroundColor?: string;
    color?: string;
  };
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: s.backgroundColor ?? theme.fgAlpha(0.08) },
      ]}
    >
      <Text style={[styles.avatarText, { color: s.color ?? theme.mutedForeground }]}>
        {firstChar(member.display_name)}
      </Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.background },
  content: { padding: 16, gap: 20, paddingBottom: 48 },
  section: { gap: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: t.foreground },
  sectionCount: { fontSize: 12, color: t.subtleForeground },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: t.fgAlpha(0.2),
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    color: t.foreground,
  },
  iconButton: { padding: 4 },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: t.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: t.fgAlpha(0.3),
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: { backgroundColor: t.primary, borderColor: t.primary },
  titleArea: { flex: 1 },
  title: { fontSize: 14, color: t.foreground },
  titleDone: {
    textDecorationLine: "line-through",
    color: t.subtleForeground,
  },
  likeArea: { flexDirection: "row", alignItems: "center", gap: 2 },
  likeCount: { fontSize: 11, color: t.mutedForeground },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 10, fontWeight: "600" },
});
