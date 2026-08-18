import { useState } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocale, useTranslations } from "use-intl";

import { FEEDBACK_BODY_MAX, type FeedbackKind } from "@triplot/shared/feedback";

import { SendIcon } from "@/components/icons";
import { SheetTitle } from "@/components/sheet-title";
import { SubmitButton } from "./submit-button";
import { toast } from "@/components/toast";
import { CompactSegment } from "@/components/visibility-segment";
import { useClearDraft, useDraft } from "@/components/form-host";
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

  const clearDraft = useClearDraft();
  const [kind, setKind] = useDraft<FeedbackKind>("kind", "bug");
  const [body, setBody] = useDraft("body", "");
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
      // 結果が画面に出ない成功なので通知する（web と同じくトースト）。
      clearDraft(); // 送信済み＝この下書きは用済み
      toast(t("sent"));
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
      <TextInput
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
      <SubmitButton
        onPress={() => void submit()}
        busy={busy}
        disabled={!body.trim()}
        accessibilityLabel={t("submit")}
        style={styles.submitButton}
      >
        <SendIcon size={20} color={theme.primaryForeground} />
      </SubmitButton>

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
    // 見た目は SubmitButton が持つ。個別の指定は不要。
    submitButton: {},
    disabled: { opacity: 0.5 },
    note: { fontSize: 12, color: t.mutedForeground },
    error: {
      fontSize: 14,
      color: t.errorText,
      backgroundColor: t.errorBg,
      borderRadius: 6,
      padding: 10,
    },
  });
