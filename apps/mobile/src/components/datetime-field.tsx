import DateTimePicker from "@react-native-community/datetimepicker";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { type Theme, useThemedStyles } from "@/lib/theme";

// 日付・日時入力の共通部品（Apple カレンダー / TripIt と同方式）:
// 値を出すチップ（PickerChip）をタップすると、直下にネイティブの inline
// ピッカー（InlineNativePicker＝カレンダー、datetime はカレンダー＋時刻行）が
// 展開する。OS のコンパクトピッカー（チップ→ポップオーバー）をやめる理由は
// 2つ: (1) ポップオーバーはプログラムから開閉制御できず「日付タップで確定して
// 閉じる」「追加と同時に開く」ができない、(2) 日付と時刻が別チップになり
// web の短縮表記（"yyyy/M/d HH:mm" 1チップ）に揃えられない。
//
// 開閉は親が制御する（1フォーム内で同時に開くのは1つだけ）:
// - mode="date" は選択＝確定として親が onChange 内で閉じる
// - mode="datetime" は勝手に閉じない（チップ再タップで閉じる）

export function PickerChip({
  text,
  onPress,
  active = false,
  disabled = false,
  accessibilityLabel,
}: {
  text: string;
  onPress: () => void;
  // ピッカー展開中の強調（OS のコンパクトピッカーが開いている間に値が
  // tint 色になるのと同じ合図）。
  active?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? text}
      style={[styles.chip, disabled && styles.disabled]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {text}
      </Text>
    </Pressable>
  );
}

export function InlineNativePicker({
  value,
  mode,
  onChange,
  minimumDate,
}: {
  value: Date;
  mode: "date" | "datetime";
  onChange: (d: Date) => void;
  minimumDate?: Date;
}) {
  return (
    <View>
      <DateTimePicker
        value={value}
        mode={mode}
        display="inline"
        minimumDate={minimumDate}
        onChange={(_, d) => {
          if (d) onChange(d);
        }}
      />
    </View>
  );
}

// チップの表記（web の短縮 UI と同じ）:
// 日時 = "2026/4/28 09:00"（年あり・月日ゼロ埋めなし・時刻は 24h ゼロ埋め）
export function chipDateTimeText(date: string, time: string): string {
  return `${chipDateText(date)} ${time}`;
}
// 日付のみ = "2026/4/28"
export function chipDateText(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}/${m}/${d}`;
}
// 終了側の短縮表記 = 開始と同日なら "10:00"、日を跨ぐなら "10:00 +1日"
// （逆順は "-n日"。通常は起きないが入力途中にはありうる）。
export function chipEndTimeText(
  startDate: string,
  endDate: string,
  endTime: string,
): string {
  const days = Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000,
  );
  if (days === 0) return endTime;
  return `${endTime} ${days > 0 ? "+" : ""}${days}日`;
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // OS のコンパクトピッカーのチップと同じ見た目（灰色地・角丸）。
    chip: {
      backgroundColor: t.fgAlpha(0.08),
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
      alignSelf: "flex-start",
    },
    chipText: {
      fontSize: 15,
      color: t.foreground,
      fontVariant: ["tabular-nums"],
    },
    chipTextActive: { color: "#2563eb" },
    disabled: { opacity: 0.5 },
  });
