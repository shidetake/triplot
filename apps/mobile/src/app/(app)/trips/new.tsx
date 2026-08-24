import { useLocalSearchParams } from "expo-router";
import { ScrollView } from "react-native";

import { CreateTripSheet } from "@/components/create-trip-sheet";
import { FormHostProvider } from "@/components/form-host";

// 旅行作成（native formSheet ルート）。presentation 等の静的オプションは
// 親 Stack（(app)/_layout.tsx）で宣言する規約。
export default function NewTripRoute() {
  // 旅行の候補（仮旅行）から来た時だけ入る。下書きの保持キーも候補ごとに
  // 分ける（普通の新規作成の入力途中と混ざらないように）。
  const { title, start, end, emails } = useLocalSearchParams<{
    title?: string;
    start?: string;
    end?: string;
    emails?: string;
  }>();
  const proposal =
    start && end && emails
      ? {
          title: title ?? null,
          startDate: start,
          endDate: end,
          emailIds: emails.split(","),
        }
      : undefined;

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <FormHostProvider
        draftKey={proposal ? `trip:proposal:${proposal.emailIds.join(",")}` : "trip:new"}
      >
        <CreateTripSheet proposal={proposal} />
      </FormHostProvider>
    </ScrollView>
  );
}
