import { useQuery } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import { updateDisplayName } from "@triplot/shared/data/account";
import { fetchUserProfile } from "@triplot/shared/data/reads/trips";

import {
  ChevronIcon,
  EditIcon,
  MessageSquareIcon,
  SaveIcon,
} from "@/components/icons";
import { SheetTitle } from "@/components/sheet-title";
import { signOut } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useSession } from "@/lib/session";

// 設定（FormSheet の中身）。デフォルト表示名の変更・フィードバック導線・
// サインアウト。テーマは RN では OS 追従（設定不要）、言語切替は端末設定準拠。
// フィードバックのフォームは兄弟の FormSheet（呼び出し元が持つ）を
// コールバックで開く（web はアカウントメニューの「フィードバック」行に対応）。
export function SettingsSheet({
  onDone,
  onOpenFeedback,
}: {
  onDone: () => void;
  onOpenFeedback: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = useTranslations();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: profile, refetch } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => fetchUserProfile(supabase, userId!),
    enabled: !!userId,
  });

  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const vName = name ?? profile?.display_name ?? "";

  const save = async () => {
    setBusy(true);
    const r = await updateDisplayName(supabase, userId!, vName);
    setBusy(false);
    if (!r.ok) return;
    void refetch();
    onDone();
  };

  // アバターの変更（web の AvatarUpload と同じ設計）:
  // 端末で 256px 正方形にリサイズ → 固定パス uid/avatar に upsert（孤児ゼロ）→
  // 保存 URL に ?v=時刻 でキャッシュ無効化。削除で avatar_url=null＝頭文字に戻る。
  const avatarUrl = profile?.avatar_url ?? null;
  const avatarInitial =
    (profile?.display_name ?? session?.user.email ?? "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?";
  const avatarPath = `${userId}/avatar`;

  const pickAndUploadAvatar = async () => {
    // iOS 標準のトリミング UI で正方形に切り出してもらう（web の中央クロップ相当）。
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (picked.canceled || !picked.assets[0]) return;
    setAvatarBusy(true);
    try {
      const rendered = await ImageManipulator.manipulate(picked.assets[0].uri)
        .resize({ width: 256, height: 256 })
        .renderAsync();
      const saved = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.85,
      });
      const bytes = await new File(saved.uri).bytes();
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(avatarPath, bytes, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(avatarPath);
      const { error: updErr } = await supabase
        .from("users")
        .update({ avatar_url: `${publicUrl}?v=${Date.now()}` })
        .eq("id", userId!);
      if (updErr) throw updErr;
      void refetch();
    } catch {
      Alert.alert(t("avatar.uploadFailed"));
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      await supabase.storage.from("avatars").remove([avatarPath]);
      const { error: updErr } = await supabase
        .from("users")
        .update({ avatar_url: null })
        .eq("id", userId!);
      if (updErr) throw updErr;
      void refetch();
    } catch {
      Alert.alert(t("avatar.deleteFailed"));
    } finally {
      setAvatarBusy(false);
    }
  };

  // カスタム画像があるとき＝変更/削除の選択（web の Menu に相当。iOS は Alert の
  // アクション列で代替）。無いとき＝直接ファイル選択。
  const onAvatarPress = () => {
    if (!avatarUrl) {
      void pickAndUploadAvatar();
      return;
    }
    Alert.alert(t("avatar.changeAria"), undefined, [
      { text: "キャンセル", style: "cancel" },
      {
        text: t("avatar.pickImage"),
        onPress: () => void pickAndUploadAvatar(),
      },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => void removeAvatar(),
      },
    ]);
  };

  return (
    <View style={styles.content}>
      <SheetTitle>{t("settings.heading")}</SheetTitle>

      <Text style={styles.email}>{session?.user.email}</Text>

      {/* アバター＋表示名（web の設定ページと同じ横並び） */}
      <View style={styles.profileRow}>
        <Pressable
          onPress={onAvatarPress}
          disabled={avatarBusy}
          accessibilityLabel={t("avatar.changeAria")}
          style={[styles.avatarButton, avatarBusy && styles.disabled]}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarInitial}>{avatarInitial}</Text>
          )}
          {/* 右上の鉛筆マーク（編集できる感。web と同形） */}
          <View style={styles.avatarEditBadge}>
            <EditIcon size={12} color={theme.primaryForeground} />
          </View>
        </Pressable>
        <View style={styles.grow}>
          {/* ラベル無し＋placeholder＝フィールド名（表示名）。説明は下のヒントが担う。 */}
          <TextInput
            value={vName}
            onChangeText={setName}
            placeholder={t("settings.namePlaceholder")}
            accessibilityLabel={t("settings.namePlaceholder")}
            placeholderTextColor={theme.subtleForeground}
            style={styles.input}
          />
          <Text style={styles.hint}>{t("settings.displayNameHelp")}</Text>
        </View>
      </View>

      <Pressable
        onPress={() => void save()}
        disabled={busy}
        accessibilityLabel="保存"
        style={[styles.submitButton, busy && styles.disabled]}
      >
        <SaveIcon size={20} color={theme.primaryForeground} />
      </Pressable>

      {/* フィードバック（iOS 設定流のドリルイン行。旅行編集のカテゴリ管理行と同形） */}
      <Pressable onPress={onOpenFeedback} style={styles.navRow}>
        <MessageSquareIcon size={18} color={theme.mutedForeground} />
        <Text style={styles.navRowLabel}>{t("feedback.menuLink")}</Text>
        <ChevronIcon size={16} color={theme.subtleForeground} />
      </Pressable>

      <Pressable
        onPress={() => {
          onDone();
          void signOut();
        }}
        style={styles.signOutButton}
      >
        <Text style={styles.signOutLabel}>{t("account.signOut")}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 16 },
  email: { fontSize: 13, color: t.mutedForeground },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  grow: { flex: 1 },
  // 自分のアバターは中立 zinc（メンバー色 hue とは別系統。web の selfAvatarClass と同じ）。
  avatarButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.fgAlpha(0.1),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  avatarInitial: { fontSize: 20, fontWeight: "500", color: t.mutedForeground },
  avatarEditBadge: {
    position: "absolute",
    right: -2,
    top: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: t.primary,
    borderWidth: 2,
    borderColor: t.background,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 4, color: t.foreground },
  hint: { fontSize: 12, color: t.mutedForeground, marginTop: 6 },
  input: {
    height: 36,
    borderWidth: 1,
    borderColor: t.fgAlpha(0.2),
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    color: t.foreground,
  },
  submitButton: {
    height: 44,
    borderRadius: 6,
    backgroundColor: t.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  // iOS 設定流のドリルイン行（edit-trip-sheet の navRow と同形）。
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.fgAlpha(0.08),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.fgAlpha(0.08),
  },
  navRowLabel: { flex: 1, fontSize: 14, color: t.foreground },
  signOutButton: {
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.fgAlpha(0.2),
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  signOutLabel: { fontSize: 13, fontWeight: "500", color: t.mutedForeground },
});
