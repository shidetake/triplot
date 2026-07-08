import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { PlaceInput } from "@triplot/shared/data/place";

// 場所欄（RN 版・M4 スコープ）: 保存済み(saved) / 自由入力(free) の2モード。
// Google サジェスト確定(google)は M5 の Places 検索実装後に追加する
// （PlaceInput の3分岐契約は shared 済みなので後付けできる）。
// 入力中は保存済み場所の前方一致候補を出し、タップで saved に確定。
// 候補を選ばずテキストを残せば free（自由入力）として保存される。
export function PlacePicker({
  places,
  value,
  onChange,
}: {
  places: { id: string; name: string }[];
  value: PlaceInput;
  onChange: (v: PlaceInput) => void;
}) {
  const [focused, setFocused] = useState(false);

  const text =
    value.kind === "saved"
      ? (places.find((p) => p.id === value.placeId)?.name ?? "")
      : value.kind === "free"
        ? (value.label ?? "")
        : value.name;

  const suggestions = useMemo(() => {
    if (!focused) return [];
    const q = text.trim().toLowerCase();
    const hit = places.filter((p) => p.name.toLowerCase().includes(q));
    return (q ? hit : places).slice(0, 5);
  }, [focused, text, places]);

  return (
    <View>
      <TextInput
        value={text}
        onChangeText={(next) =>
          onChange(
            next.trim() === ""
              ? { kind: "saved", placeId: null }
              : { kind: "free", label: next },
          )
        }
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Eggs 'n Things"
        placeholderTextColor="rgba(0,0,0,0.38)"
        style={styles.input}
      />
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((p) => (
            <Pressable
              key={p.id}
              // onBlur より先に発火させたいので onPressIn
              onPressIn={() => {
                onChange({ kind: "saved", placeId: p.id });
                setFocused(false);
              }}
              style={styles.suggestionRow}
            >
              <Text style={styles.suggestionText}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 36,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  suggestions: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 6,
    marginTop: 4,
    backgroundColor: "#fff",
  },
  suggestionRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  suggestionText: { fontSize: 14 },
});
