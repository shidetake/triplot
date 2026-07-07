import { useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";

import { signOut } from "@/lib/auth";
import { useSession } from "@/lib/session";

// ── M1 の受け入れ確認用の一時画面（M3 で旅行一覧に置き換える） ──
// ログイン済みユーザーの email 表示とサインアウトだけ。
export default function HomeScreen() {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.body}>ログイン中: {session?.user.email}</Text>
      <Button
        title="ログアウト"
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void signOut().finally(() => setBusy(false));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  body: { fontSize: 14 },
});
