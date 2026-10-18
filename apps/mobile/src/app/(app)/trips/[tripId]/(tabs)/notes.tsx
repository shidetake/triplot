import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import {
  deleteNoteReturning,
  restoreNote,
} from "@triplot/shared/data/notes";
import { deriveNotes, notePreview, noteTitle } from "@triplot/shared/notes";

import { PlusIcon } from "@/components/icons";
import { LoadError } from "@/components/load-error";
import { PrivateBadge } from "@/components/private-badge";
import { SwipeDeleteRow } from "@/components/swipe-delete-row";
import { LIST_ROW_PADDING_H, MOBILE_TAB_BAR_TOP } from "@/lib/layout";
import { pushOnce } from "@/lib/navigate";
import { useOptimisticHide } from "@/lib/optimistic-hide";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useUndoable } from "@/lib/undoable";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { useInvalidateTrip, useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// ノートのタブ。web の components/notes-section.tsx 相当。一覧は最後に
// 書き換えた順で、タップで開く（trips/note の画面へ push）。
// 全行が同じように消せるのでスワイプで消す（他の人が編集中の行だけは
// 消せない＝スワイプを受けない）。
export default function NotesTab() {
  const tripId = useTripId();
  const t = useTranslations("notes");
  const tCommon = useTranslations("common");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data, me, loadError, refetch, isRefetching } = useTripDetail(tripId);
  const { refreshing, onRefresh } = usePullRefresh(refetch);
  const invalidate = useInvalidateTrip(tripId);
  const runUndoable = useUndoable(invalidate);
  const hide = useOptimisticHide();

  if (loadError) {
    return (
      <LoadError error={loadError} onRetry={refetch} isRetrying={isRefetching} />
    );
  }
  if (!data?.trip || !me) return null;

  const notes = deriveNotes(data.notesRaw).filter((n) => !hide.has(n.id));
  const nameOf = (id: string) =>
    data.members?.find((m) => m.id === id)?.display_name ?? "";

  const remove = (id: string) => {
    runUndoable(
      hide.wrap(id, {
        apply: () => deleteNoteReturning(supabase, id),
        restore: (snapshot) => restoreNote(supabase, snapshot),
        done: t("deleted"),
        failed: (error) => t("failed", { error }),
      }),
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {notes.length === 0 ? (
          <Text style={styles.empty}>{t("empty")}</Text>
        ) : (
          <View style={styles.listCard}>
            {notes.map((n, i) => {
              const editingBy =
                n.lockedByMemberId && n.lockedByMemberId !== me.id
                  ? nameOf(n.lockedByMemberId)
                  : null;
              const sub =
                editingBy !== null
                  ? t("editingBy", { name: editingBy })
                  : notePreview(n.body);
              return (
                <SwipeDeleteRow
                  key={n.id}
                  enabled={editingBy === null}
                  measureKey={`${noteTitle(n.body)}|${sub}`}
                  actions={[
                    {
                      icon: "trash",
                      label: tCommon("delete"),
                      destructive: true,
                      onPress: () => remove(n.id),
                    },
                  ]}
                >
                  <Pressable
                    onPress={() =>
                      pushOnce(`/trips/note?tripId=${tripId}&noteId=${n.id}`)
                    }
                    style={[styles.row, i > 0 && styles.rowDivider]}
                  >
                    <View style={styles.titleLine}>
                      <Text style={styles.title} numberOfLines={1}>
                        {noteTitle(n.body)}
                      </Text>
                      {n.visibility === "private" && <PrivateBadge />}
                    </View>
                    {sub ? (
                      <Text style={styles.sub} numberOfLines={1}>
                        {sub}
                      </Text>
                    ) : null}
                  </Pressable>
                </SwipeDeleteRow>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => pushOnce(`/trips/note?tripId=${tripId}`)}
        style={styles.fab}
        accessibilityLabel={t("addAria")}
      >
        <PlusIcon size={24} color={theme.primaryForeground} />
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    // FAB（タブバーの上 + 56）に最後の行が隠れないだけの余白（費用タブと同じ）。
    content: { padding: 16, paddingBottom: 172 },
    empty: { padding: 24, fontSize: 14, color: t.mutedForeground },
    // 同種の項目の一覧なので1つの枠＋区切り線（ui-guidelines「行にするか
    // カードにするか」）。
    listCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.fgAlpha(0.12),
      borderRadius: 6,
      overflow: "hidden",
    },
    // 左右の余白は行が持つ（区切り線を器の端まで引くため）。
    row: {
      paddingVertical: 12,
      paddingHorizontal: LIST_ROW_PADDING_H,
      gap: 2,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.fgAlpha(0.1),
    },
    titleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
    title: {
      flexShrink: 1,
      fontSize: 14,
      fontWeight: "600",
      color: t.foreground,
    },
    sub: { fontSize: 12, color: t.mutedForeground },
    fab: {
      position: "absolute",
      right: 20,
      // タブバー（ネイティブの浮島）のヒット領域より上に出す（費用タブと同じ）。
      bottom: MOBILE_TAB_BAR_TOP + 17,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: t.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
  });
