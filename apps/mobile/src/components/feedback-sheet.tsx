import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useState } from "react";
import {
  Alert,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocale, useTranslations } from "use-intl";

import { FEEDBACK_BODY_MAX, type FeedbackKind } from "@triplot/shared/feedback";

import { SendIcon } from "@/components/icons";
import { SheetTitle } from "@/components/sheet-title";
import { CompactSegment } from "@/components/visibility-segment";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// フィードバック送信の受け側は web の /api/feedback（web/RN 共通の単一経路。
// RN は cookie が無いので Authorization: Bearer で認証する）。
const FEEDBACK_URL = "https://triplot.app/api/feedback";

// フィードバック（不具合報告・要望）の送信フォーム（FormSheet の中身）。
// web の FeedbackForm と同じ項目: 種別セグメント＋本文＋送信＋診断情報の注記。
export function FeedbackSheet({ onDone }: { onDone: () => void }) {
  const t = useTranslations("feedback");
  const locale = useLocale();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("no session");
      // バグ再現用の診断情報（web と同じ項目を自動収集。注記1文のみで告知）。
      const { width, height } = Dimensions.get("window");
      const res = await fetch(FEEDBACK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          kind,
          body,
          path: null,
          locale: locale === "en" ? "en" : "ja",
          platform: "ios",
          viewport: `${Math.round(width)}x${Math.round(height)}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          theme: theme.dark ? "dark" : "light",
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      // 結果が画面に出ない成功なので通知する（web はトースト。RN は Alert）。
      Alert.alert(t("sent"));
      onDone();
    } catch {
      setError(t("sendFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.content}>
      <SheetTitle>{t("heading")}</SheetTitle>

      {/* 種別（不具合/要望） */}
      <CompactSegment
        options={[
          { key: "bug", label: t("kindBug") },
          { key: "feature", label: t("kindFeature") },
        ]}
        value={kind}
        onChange={setKind}
        grow
      />

      {/* 本文。placeholder が「何を書くか」の例文を兼ねる（web と同じ）。 */}
      <BottomSheetTextInput
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={FEEDBACK_BODY_MAX}
        placeholder={kind === "bug" ? t("placeholderBug") : t("placeholderFeature")}
        accessibilityLabel={t("bodyLabel")}
        placeholderTextColor={theme.subtleForeground}
        style={styles.bodyInput}
      />

      {/* 必須（本文）は「埋まるまで送信無効」で表現（iOS 方式）。 */}
      <Pressable
        onPress={() => void submit()}
        disabled={busy || !body.trim()}
        accessibilityLabel={t("submit")}
        style={[
          styles.submitButton,
          (busy || !body.trim()) && styles.disabled,
        ]}
      >
        <SendIcon size={20} color={theme.primaryForeground} />
      </Pressable>

      <Text style={styles.note}>{t("diagnosticsNote")}</Text>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: 16, gap: 14 },
    bodyInput: {
      minHeight: 112,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      color: t.foreground,
      textAlignVertical: "top",
    },
    submitButton: {
      height: 44,
      borderRadius: 6,
      backgroundColor: t.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    disabled: { opacity: 0.5 },
    note: { fontSize: 12, color: t.mutedForeground },
    error: {
      fontSize: 13,
      color: t.errorText,
      backgroundColor: t.errorBg,
      borderRadius: 6,
      padding: 10,
    },
  });
