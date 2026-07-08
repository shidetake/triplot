import { StyleSheet, Text, View } from "react-native";

// 場所タブ（地図）は M5 で実装。
export default function PlacesTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>場所タブ（M5 で実装）</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholder: { fontSize: 13, color: "rgba(0,0,0,0.4)" },
});
