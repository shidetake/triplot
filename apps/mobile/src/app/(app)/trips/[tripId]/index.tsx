import { StyleSheet, Text, View } from "react-native";

// 予定タブ（週カレンダー）は M6 で実装。
export default function ScheduleTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>予定タブ（M6 で実装）</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholder: { fontSize: 13, color: "rgba(0,0,0,0.4)" },
});
