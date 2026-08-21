import { useMemo, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import type { PlaceInput } from "@triplot/shared/data/place";
import {
  candidateToPlaceInput,
  type PlacePrediction,
} from "@triplot/shared/placesSearch";

import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { usePlaceAutocomplete } from "@/lib/usePlaceAutocomplete";

type Row =
  | { type: "saved"; id: string; name: string }
  | { type: "google"; prediction: PlacePrediction };

// 場所欄（RN 版）: 保存済み(saved) / Google サジェスト確定(google) / 自由入力(free)
// の3モード（web の place-picker と同じ契約・同じ並び：保存済み→Google の順）。
// 入力中は保存済み場所の前方一致候補＋Google の入力中サジェスト（300ms debounce）を
// 混ぜて出す。候補を選ばずテキストを残せば free（自由入力）として保存される。
export function PlacePicker({
  places,
  biasCenter,
  value,
  onChange,
  placeholder,
}: {
  places: { id: string; name: string }[];
  // Google サジェストの地理バイアス（旅行の既存ピンの重心）。無ければ無バイアス。
  biasCenter?: { lat: number; lng: number };
  value: PlaceInput;
  onChange: (v: PlaceInput) => void;
  // ラベルは置かない規約なので placeholder＝フィールド名（場所）を呼び出し側が渡す。
  placeholder: string;
}) {
  const t = useTheme();
  const tPlace = useTranslations("place");
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);
  const { predictions, search, clear, resolve } =
    usePlaceAutocomplete(biasCenter);

  const text =
    value.kind === "saved"
      ? (places.find((p) => p.id === value.placeId)?.name ?? "")
      : value.kind === "free"
        ? (value.label ?? "")
        : value.name;

  const savedMatches = useMemo(() => {
    const q = text.trim().toLowerCase();
    const hit = places.filter((p) => p.name.toLowerCase().includes(q));
    return (q ? hit : places).slice(0, 5);
  }, [text, places]);

  const rows: Row[] = focused
    ? [
        ...savedMatches.map((p): Row => ({
          type: "saved",
          id: p.id,
          name: p.name,
        })),
        ...predictions.map((p): Row => ({ type: "google", prediction: p })),
      ]
    : [];

  const closeSuggestions = () => {
    setFocused(false);
    clear();
  };

  return (
    <View>
      <TextInput
        value={text}
        onChangeText={(next) => {
          onChange(
            next.trim() === ""
              ? { kind: "saved", placeId: null }
              : { kind: "free", label: next },
          );
          search(next);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        placeholderTextColor={t.subtleForeground}
        style={styles.input}
      />
      {rows.length > 0 && (
        <View style={styles.suggestions}>
          {/* 候補だけがスクロールし、下の帰属表示は流れない
              （器は maxHeight で頭打ちなので、包まないと候補に押し出されて
              切れる＝「常に見えて読めること」を満たせない）。 */}
          <ScrollView
            style={styles.suggestionScroll}
            keyboardShouldPersistTaps="handled"
          >
            {rows.map((row) =>
              row.type === "saved" ? (
                <Pressable
                  key={`s-${row.id}`}
                  // onBlur より先に発火させたいので onPressIn
                  onPressIn={() => {
                    onChange({ kind: "saved", placeId: row.id });
                    closeSuggestions();
                    Keyboard.dismiss();
                  }}
                  style={styles.suggestionRow}
                >
                  <Text style={styles.suggestionText}>{row.name}</Text>
                  <Text style={styles.savedBadge}>{tPlace("savedBadge")}</Text>
                </Pressable>
              ) : (
                <Pressable
                  key={`g-${row.prediction.placeId}`}
                  onPressIn={() => {
                    closeSuggestions();
                    Keyboard.dismiss();
                    void resolve(row.prediction).then((c) => {
                      if (c) onChange(candidateToPlaceInput(c));
                    });
                  }}
                  style={styles.suggestionRow}
                >
                  <View style={styles.suggestionTextCol}>
                    <Text style={styles.suggestionText} numberOfLines={1}>
                      {row.prediction.primaryText}
                    </Text>
                    {row.prediction.secondaryText ? (
                      <Text
                        style={styles.suggestionSecondary}
                        numberOfLines={1}
                      >
                        {row.prediction.secondaryText}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ),
            )}
          </ScrollView>
          {/* 地図を伴わずに Google の場所データを出すので帰属表示が要る
              （web の GoogleAttribution と同じ理由・同じ文言）。 */}
          {rows.some((r) => r.type === "google") && (
            <Text style={styles.attribution}>Google Maps</Text>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    input: {
      height: 36,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 10,
      fontSize: 14,
      color: t.foreground,
    },
    suggestions: {
      maxHeight: 256,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.1),
      borderRadius: 6,
      marginTop: 4,
      backgroundColor: t.background,
      overflow: "hidden",
    },
    suggestionScroll: { flexShrink: 1 },
    suggestionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.08),
    },
    suggestionTextCol: { flex: 1, minWidth: 0 },
    suggestionText: { flexShrink: 1, fontSize: 14, color: t.foreground },
    suggestionSecondary: {
      flexShrink: 1,
      fontSize: 12,
      color: t.mutedForeground,
    },
    savedBadge: { fontSize: 11, color: t.subtleForeground },
    attribution: {
      fontSize: 12,
      color: t.mutedForeground,
      textAlign: "right",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.fgAlpha(0.1),
    },
  });
