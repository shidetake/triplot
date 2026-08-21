import { useMemo } from "react";
import { FlatList, StyleSheet, Text } from "react-native";
import { useTranslations } from "use-intl";

import { SheetTitle } from "@/components/sheet-title";
import { googleMapsLegalNotice } from "@/lib/googleMapsNotice";
import { type Theme, useThemedStyles } from "@/lib/theme";

// 1つの <Text> に流し込む行数。全文は約110万文字あり、丸ごと1つの <Text> に
// 入れると iOS のテキストレイアウトが破綻して**何も描画されない**（実機で確認。
// 見出しだけ出て本文が空になる）。オープンソースライセンス一覧と同じく
// FlatList で仮想化し、1要素あたりの文字数を抑える。
const LINES_PER_CHUNK = 40;

// Google マップの法的通知（設定 → このアプリについて からのドリルイン）。
// 出どころと、オープンソースライセンス一覧と別立てにしている理由は
// lib/googleMapsNotice.ts のコメント参照。
export function GoogleNoticeSheet() {
  const t = useTranslations("about");
  const styles = useThemedStyles(makeStyles);
  const notice = googleMapsLegalNotice();

  const chunks = useMemo(() => {
    if (!notice) return [];
    const lines = notice.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i += LINES_PER_CHUNK) {
      out.push(lines.slice(i, i + LINES_PER_CHUNK).join("\n"));
    }
    return out;
  }, [notice]);

  return (
    <FlatList
      data={chunks}
      keyExtractor={(_, index) => String(index)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<SheetTitle>{t("googleNotice")}</SheetTitle>}
      // 取れない場合でも画面自体は出す（空白のまま閉じるより、取得できて
      // いないことが分かる方が気付ける）。
      ListEmptyComponent={
        <Text style={styles.empty}>法的通知を読み込めませんでした。</Text>
      }
      renderItem={({ item }: { item: string }) => (
        <Text style={styles.body} selectable>
          {item}
        </Text>
      )}
    />
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: 16, paddingBottom: 24 },
    // 原文は英語の整形済みテキストなので等幅で折り返しだけ任せる。
    body: {
      fontSize: 11,
      lineHeight: 16,
      color: t.mutedForeground,
      fontFamily: "Menlo",
    },
    empty: { fontSize: 14, color: t.mutedForeground },
  });
