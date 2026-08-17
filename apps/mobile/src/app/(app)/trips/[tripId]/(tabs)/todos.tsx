import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { ScreenStack, ScreenStackItem } from "react-native-screens";
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

import { QueryErrorView } from "@/components/query-error-view";
import { SheetTitle } from "@/components/sheet-title";
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
const PRIORITY_ORDER: TodoPriority[] = ["high", "medium", "low"];

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
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data, me, userId, loadError, refetch, isRefetching } =
    useTripDetail(tripId);
  const { refreshing, onRefresh } = usePullRefresh(refetch);

  // 優先度ピッカーは「高/中/低」から選ぶシート（web のドロップダウンと同じ
  // アイコン＋ラベル＋選択中チェックの行。ActionSheetIOS はテキストのみで
  // アイコンを出せないため独自のシートにする）。実装はアプリ内の他のシートと
  // 同じ native formSheet（ScreenStackItem）＝場所タブと同じく、タブ画面の
  // 中に ScreenStack を入れ子にするパターン（places.tsx が先例）。
  // 2つの TodoSection から共通で開くので、状態はここで持って
  // ScreenStack 直下の兄弟 ScreenStackItem として1つだけ描画する。
  const [priorityPick, setPriorityPick] = useState<{
    current: TodoPriority;
    onPick: (p: TodoPriority) => void;
  } | null>(null);

  if (loadError) {
    return (
      <QueryErrorView
        error={loadError}
        onRetry={refetch}
        isRetrying={isRefetching}
      />
    );
  }
  if (!data?.trip || !me) return null;

  const priorityLabel: Record<TodoPriority, string> = {
    high: t("todo.priorityHigh"),
    medium: t("todo.priorityMedium"),
    low: t("todo.priorityLow"),
  };

  const todos = deriveTodos(data.todosRaw, me.id);
  const members: MemberLite[] = (data.members ?? []).map((m) => ({
    id: m.id,
    display_name: m.display_name,
    color: m.color,
    avatarUrl: m.users?.avatar_url ?? null,
  }));
  return (
    <ScreenStack style={StyleSheet.absoluteFill}>
      <ScreenStackItem
        screenId="todos-list"
        activityState={2}
        style={StyleSheet.absoluteFill}
        headerConfig={{ hidden: true }}
      >
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          // 現地セクションの追加行など画面下方の入力がソフトウェアキーボードに
          // 隠れないよう、キーボード表示時に下インセットを足す（iOS 標準挙動）。
          automaticallyAdjustKeyboardInsets
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
            onPickPriority={(current, onPick) =>
              setPriorityPick({ current, onPick })
            }
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
            onPickPriority={(current, onPick) =>
              setPriorityPick({ current, onPick })
            }
          />
        </ScrollView>
      </ScreenStackItem>

      {priorityPick && (
        <ScreenStackItem
          screenId="todos-priority"
          activityState={2}
          stackPresentation="formSheet"
          sheetAllowedDetents="fitToContents"
          sheetGrabberVisible
          headerConfig={{ hidden: true }}
          onDismissed={() => setPriorityPick(null)}
        >
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <SheetTitle>{t("todo.priorityTitle")}</SheetTitle>
            {PRIORITY_ORDER.map((p) => {
              const selected = priorityPick.current === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => {
                    priorityPick.onPick(p);
                    setPriorityPick(null);
                  }}
                  accessibilityLabel={priorityLabel[p]}
                  style={[
                    styles.priorityRow,
                    selected && styles.priorityRowSelected,
                  ]}
                >
                  <PriorityIcon priority={p} />
                  <Text
                    style={[
                      styles.priorityRowLabel,
                      selected && styles.priorityRowLabelSelected,
                    ]}
                  >
                    {priorityLabel[p]}
                  </Text>
                  {selected && (
                    <CheckIcon size={16} color={theme.mutedForeground} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </ScreenStackItem>
      )}
    </ScreenStack>
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
  onPickPriority,
}: {
  tripId: string;
  kind: TodoKind;
  title: string;
  defaultCollapsed: boolean;
  todos: TodoRow[];
  members: MemberLite[];
  myMemberId: string;
  userId: string;
  // 優先度シートは親（TodosTab）が ScreenStack 直下に1つだけ持つ。
  onPickPriority: (
    current: TodoPriority,
    onPick: (p: TodoPriority) => void,
  ) => void;
}) {
  const t = useTranslations("todo");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const invalidate = useInvalidateTrip(tripId);
  const memberById = new Map(members.map((m) => [m.id, m]));

  const priorityLabel: Record<TodoPriority, string> = {
    high: t("priorityHigh"),
    medium: t("priorityMedium"),
    low: t("priorityLow"),
  };

  const pickPriority = onPickPriority;

  // 折りたたみ既定はフェーズ由来（旅行開始後は準備を畳む。web と同じ）。
  // 手動で開閉したら覚えて次回以降は既定より優先する（web は localStorage、
  // RN は AsyncStorage。キーの体系も web と同じ）。
  const storageKey = `triplot.todoCollapsed.${tripId}.${kind}`;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  useEffect(() => {
    void AsyncStorage.getItem(storageKey).then((saved) => {
      if (saved === "1" || saved === "0") setCollapsed(saved === "1");
    });
  }, [storageKey]);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      // 保存失敗は無視（画面の状態だけ反映する）。
      void AsyncStorage.setItem(storageKey, next ? "1" : "0").catch(() => {});
      return next;
    });
  };

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

  // タイトルはその場で TextInput に差し替えて編集（web のインライン編集と
  // 同じ。iOS リマインダーも同方式。以前の Alert.prompt はダイアログが挟まり
  // web と操作感がずれていた）。blur / return で確定。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const startEdit = (todo: TodoRow) => {
    setEditingId(todo.id);
    setEditingText(todo.title);
  };

  const commitEdit = async () => {
    if (!editingId) return;
    const id = editingId;
    const text = editingText.trim();
    setEditingId(null);
    const original = todos.find((x) => x.id === id);
    if (!original || !text || text === original.title) return;
    const r = await updateTodo(supabase, id, { title: text });
    if (!r.ok) fail(r.error);
    void invalidate();
  };

  const changePriority = async (todo: TodoRow, next: TodoPriority) => {
    if (next === todo.priority) return;
    const r = await updateTodo(supabase, todo.id, { priority: next });
    if (!r.ok) fail(r.error);
    void invalidate();
  };

  const confirmDelete = (todo: TodoRow) => {
    Alert.alert(t("deleteTitle"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
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
        onPress={toggleCollapsed}
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
              placeholder={t("placeholderAdd")}
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
                filled={draftPrivate}
                color={draftPrivate ? theme.foreground : theme.subtleForeground}
              />
            </Pressable>
            <Pressable
              onPress={() => pickPriority(draftPriority, setDraftPriority)}
              hitSlop={8}
              accessibilityLabel={t("priorityAriaLabel", {
                label: priorityLabel[draftPriority],
              })}
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

                <Pressable
                  onPress={() =>
                    pickPriority(todo.priority, (p) =>
                      void changePriority(todo, p),
                    )
                  }
                  hitSlop={8}
                  accessibilityLabel={t("priorityAriaLabel", {
                    label: priorityLabel[todo.priority],
                  })}
                >
                  <PriorityIcon priority={todo.priority} />
                </Pressable>

                {/* 行の並びは「左=読む情報（優先度・タイトル・鍵）／
                    右端=誰の投稿か＋押すもの（作成者アバター・♥・削除）」の
                    グループ分け（web と同形）。作成者アバターはタイトルの
                    長さに関係なく行の右側に揃える＝タイトル側（flex）に
                    置くと文字の長さでアバターの位置がガタつくため、
                    ここでは行トップレベルの子として右寄せ側に置く
                    （gap は row 側の一定値に任せる＝ハート/削除の間隔と
                    揃える。実機フィードバック）。 */}
                {editingId === todo.id ? (
                  <TextInput
                    autoFocus
                    value={editingText}
                    onChangeText={setEditingText}
                    onBlur={() => void commitEdit()}
                    onSubmitEditing={() => void commitEdit()}
                    returnKeyType="done"
                    style={[styles.titleArea, styles.titleInput]}
                  />
                ) : (
                  <View style={styles.titleGroup}>
                    <Pressable
                      onPress={() => startEdit(todo)}
                      style={styles.titleShrink}
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
                  </View>
                )}

                {editingId !== todo.id && creator && <Avatar member={creator} />}

                {kind === "onsite" && (
                  <>
                    <Pressable
                      onPress={() => likeMutation.mutate(todo.id)}
                      hitSlop={8}
                      accessibilityLabel={
                        todo.iLiked ? t("likeRemove") : t("like")
                      }
                    >
                      <HeartIcon
                        size={15}
                        color={todo.iLiked ? "#f43f5e" : theme.subtleForeground}
                        filled={todo.iLiked}
                      />
                    </Pressable>
                    {/* いいね数は ♥ と削除の間の固定幅スロットに常時確保する。
                        数字の有無で ♥ の位置が動かず、空きスロットが誤タップ
                        分離の余白を兼ねる（web と同じ）。 */}
                    <Text style={styles.likeCount}>
                      {todo.likeCount > 0 ? todo.likeCount : ""}
                    </Text>
                  </>
                )}

                <Pressable
                  onPress={() => confirmDelete(todo)}
                  hitSlop={8}
                  accessibilityLabel={t("deleteAria")}
                >
                  {/* 削除＝destructive 赤（web の TODO 行・カテゴリ管理と同じ） */}
                  <TrashIcon size={15} color={theme.destructiveText} />
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
  // タイトル＋鍵＋作成者アバターを左寄せで束ねる（押せない情報はタイトル側）
  titleGroup: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  titleShrink: { flexShrink: 1, minWidth: 0 },
  title: { fontSize: 14, color: t.foreground },
  // インライン編集中の入力。行の見た目を崩さないよう枠なし・タイトルと同じ字面
  titleInput: { fontSize: 14, color: t.foreground, padding: 0 },
  titleDone: {
    textDecorationLine: "line-through",
    color: t.subtleForeground,
  },
  // いいね数の固定幅スロット（2桁まで）。空でも幅を保ち ♥ の位置を固定する
  likeCount: { width: 16, fontSize: 11, color: t.mutedForeground },
  sheetScroll: { paddingBottom: 24 },
  // 優先度選択シートの行（場所タブのフィルタシートの行と同じ形）
  priorityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.fgAlpha(0.08),
  },
  priorityRowSelected: { backgroundColor: t.secondary },
  priorityRowLabel: { flex: 1, fontSize: 15, color: t.foreground },
  priorityRowLabelSelected: { fontWeight: "600" },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 10, fontWeight: "600" },
});
