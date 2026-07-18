import { useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import {
  CATEGORY_IN_USE,
  CUSTOM_CATEGORY_COLOR,
  CUSTOM_CATEGORY_ICON,
  createExpenseCategory,
  deleteExpenseCategory,
  updateExpenseCategoryName,
} from "@triplot/shared/data/categories";
import { deriveCategories, type Category } from "@triplot/shared/tripDerive";

import { ExpenseCategoryIcon } from "@/components/expense-category-icon";
import { PlusIcon, TrashIcon, XIcon } from "@/components/icons";
import { SheetTitle } from "@/components/sheet-title";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useInvalidateTrip, useTripDetail } from "@/lib/useTripDetail";

// 費用カテゴリ管理（FormSheet の中身）。web の categories ページと同じ機能:
// デフォルトカテゴリ（key あり）は名前固定、カスタム（key なし）は改名・削除可、
// 追加はカスタム固定アイコン＋青。旅行の編集シートからドリルインで開く。
// 入力は素の TextInput（BottomSheetTextInput ではない）。ホストの FormSheet が
// keyboardBehavior="extend"（部分リフト）のため（form-sheet.tsx の使い分け参照）。
export function CategoriesSheet({ tripId }: { tripId: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = useTranslations("categories");
  const tExp = useTranslations("expense");
  const { data } = useTripDetail(tripId);
  const invalidate = useInvalidateTrip(tripId);

  // デフォルトカテゴリ（key あり）は i18n 名、カスタムは DB の名前
  // （web の category-management-list と同じ解決）。
  const catName = (c: Category) => (c.key ? tExp(`cat.${c.key}`) : c.name);

  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [busy, setBusy] = useState(false);
  // saveNew の二重発火（onSubmitEditing + onBlur）で重複 insert するのを防ぐ。
  const savingNewRef = useRef(false);

  if (!data?.trip) return null;
  const categories = deriveCategories(data.categoriesRaw);

  const startEdit = (c: Category) => {
    setEditId(c.id);
    setEditValue(c.name);
  };

  // web の commitEdit と同じ構造: 値を確保 → 編集状態を先に閉じる → 非同期保存。
  const commitEdit = (c: Category) => {
    if (editId !== c.id) return;
    const name = editValue.trim();
    setEditId(null);
    setEditValue("");
    if (!name || name === c.name) return;
    setBusy(true);
    void updateExpenseCategoryName(supabase, c.id, name).then((r) => {
      setBusy(false);
      if (!r.ok) {
        Alert.alert(t("saveFailed"));
        return;
      }
      void invalidate();
    });
  };

  const saveNew = () => {
    // 追加の入力は onSubmitEditing（完了キー）と onBlur（フォーカスが外れる）の
    // 両方で saveNew を呼ぶ。完了キーは送信と同時にフォーカスも外す（＝両方が
    // 続けて発火する）ため、ガードしないと同じ名前を 2 回 insert してしまい、
    // 2 回目が unique(trip_id, name) 違反で「保存に失敗しました」になる。
    // 1 回の追加操作につき保存は 1 回だけにする。
    if (savingNewRef.current) return;
    const name = addValue.trim();
    setIsAdding(false);
    setAddValue("");
    if (!name) return;
    savingNewRef.current = true;
    setBusy(true);
    void createExpenseCategory(supabase, tripId, name).then((r) => {
      savingNewRef.current = false;
      setBusy(false);
      if (!r.ok) {
        Alert.alert(t("saveFailed"));
        return;
      }
      void invalidate();
    });
  };

  const confirmDelete = (c: Category) => {
    if (editId === c.id) {
      setEditId(null);
      setEditValue("");
    }
    Alert.alert(t("deleteConfirmTitle"), undefined, [
      { text: "キャンセル", style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () => {
          void deleteExpenseCategory(supabase, c.id).then((r) => {
            if (!r.ok) {
              Alert.alert(
                r.error === CATEGORY_IN_USE
                  ? t("deleteInUse")
                  : t("deleteFailed"),
              );
              return;
            }
            void invalidate();
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.content}>
      <SheetTitle>{t("heading")}</SheetTitle>

      {categories.map((c) => {
        const isEditing = editId === c.id;
        const isCustom = c.key == null;
        return (
          <View key={c.id} style={styles.row}>
            <View
              style={[
                styles.iconCircle,
                {
                  backgroundColor: isEditing ? CUSTOM_CATEGORY_COLOR : c.color,
                },
              ]}
            >
              <ExpenseCategoryIcon
                icon={isEditing ? CUSTOM_CATEGORY_ICON : c.icon}
                size={24}
                inset={0.18}
                color="#fff"
              />
            </View>
            {isEditing ? (
              <TextInput
                autoFocus
                value={editValue}
                onChangeText={setEditValue}
                editable={!busy}
                style={[styles.input, styles.rowInput]}
                onBlur={() => commitEdit(c)}
                onSubmitEditing={() => commitEdit(c)}
                returnKeyType="done"
              />
            ) : (
              <Pressable
                disabled={!isCustom}
                onPress={() => startEdit(c)}
                style={styles.nameButton}
              >
                <Text style={styles.name} numberOfLines={1}>
                  {catName(c)}
                </Text>
              </Pressable>
            )}
            {isCustom && (
              <Pressable
                onPress={() => confirmDelete(c)}
                hitSlop={8}
                accessibilityLabel={t("delete")}
              >
                <TrashIcon size={16} color={theme.destructiveText} />
              </Pressable>
            )}
          </View>
        );
      })}

      {isAdding ? (
        <View style={styles.row}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: CUSTOM_CATEGORY_COLOR },
            ]}
          >
            <ExpenseCategoryIcon
              icon={CUSTOM_CATEGORY_ICON}
              size={24}
              inset={0.18}
              color="#fff"
            />
          </View>
          <TextInput
            autoFocus
            value={addValue}
            onChangeText={setAddValue}
            editable={!busy}
            placeholder={t("nameLabel")}
            placeholderTextColor={theme.subtleForeground}
            style={[styles.input, styles.rowInput]}
            onBlur={saveNew}
            onSubmitEditing={saveNew}
            returnKeyType="done"
          />
          <Pressable
            onPress={() => {
              setIsAdding(false);
              setAddValue("");
            }}
            hitSlop={8}
            accessibilityLabel="キャンセル"
          >
            <XIcon size={16} color={theme.mutedForeground} />
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setIsAdding(true)} style={styles.addButton}>
          <PlusIcon size={16} color={theme.mutedForeground} />
          <Text style={styles.addLabel}>{t("add")}</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: 16, gap: 4 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 6,
    },
    iconCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    nameButton: { flex: 1, paddingVertical: 4 },
    name: { fontSize: 14, color: t.foreground },
    input: {
      height: 36,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 10,
      fontSize: 14,
      color: t.foreground,
    },
    rowInput: { flex: 1 },
    // 破線ボーダー＝「ここに追加できる」（ui-guidelines の定型）。
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    addLabel: { fontSize: 14, color: t.mutedForeground },
  });
