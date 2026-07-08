import { StyleSheet, Text, View } from "react-native";

// 費用タブ（一覧・精算）は M4 で実装。
export default function ExpensesTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>費用タブ（M4 で実装）</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholder: { fontSize: 13, color: "rgba(0,0,0,0.4)" },
});
