import { Image, StyleSheet, Text, View } from "react-native";

import { avatarStyle, firstChar } from "@triplot/shared/memberColors";

import { useTheme } from "@/lib/theme";

export type MemberLite = {
  id: string;
  display_name: string;
  color: number | null;
  avatarUrl: string | null;
};

// 色丸＋頭文字（web の MemberAvatar 相当。写真があれば写真）。
// 「誰が」を示す箇所は必ずこれ（docs/ui-guidelines.md の定型部品）。
export function MemberAvatar({
  member,
  size = 18,
}: {
  member: MemberLite;
  size?: number;
}) {
  const t = useTheme();
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (member.avatarUrl) {
    return <Image source={{ uri: member.avatarUrl }} style={round} />;
  }
  const s = avatarStyle(member.color) as {
    backgroundColor?: string;
    color?: string;
  };
  return (
    <View
      style={[
        styles.circle,
        round,
        { backgroundColor: s.backgroundColor ?? t.fgAlpha(0.08) },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: s.color ?? t.mutedForeground,
            fontSize: Math.round(size * 0.55),
          },
        ]}
      >
        {firstChar(member.display_name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  text: { fontWeight: "600" },
});
