import { FlatList, StyleSheet, Text, View } from "react-native";

import { LICENSES, type LicenseEntry } from "@/licenses.generated";
import { SheetTitle } from "@/components/sheet-title";
import { type Theme, useThemedStyles } from "@/lib/theme";

// OSS ライセンス一覧（設定 → このアプリについて からのドリルイン）。
// 中身は scripts/gen-licenses.mjs が生成する licenses.generated.ts
// （単一の真実はその生成元＝リポジトリの依存関係そのもの。手で編集しない）。
// 576件と数が多いので ScrollView ではなく FlatList で仮想化する。
export function LicensesSheet() {
  const styles = useThemedStyles(makeStyles);

  return (
    <FlatList
      data={LICENSES}
      keyExtractor={(item, index) => `${item.name}@${item.version}:${index}`}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<SheetTitle>オープンソースライセンス</SheetTitle>}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }: { item: LicenseEntry }) => (
        <View style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.meta}>{`${item.version} ・ ${item.license}`}</Text>
        </View>
      )}
    />
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: 16, paddingBottom: 24 },
    row: { paddingVertical: 10 },
    name: { fontSize: 14, color: t.foreground },
    meta: { fontSize: 12, color: t.mutedForeground, marginTop: 2 },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.fgAlpha(0.08),
    },
  });
