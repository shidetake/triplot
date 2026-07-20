import { useQueryClient } from "@tanstack/react-query";
import { RefreshControl, ScrollView } from "react-native";

import { InboxSheet } from "@/components/inbox-sheet";
import { useSession } from "@/lib/session";
import { usePullRefresh } from "@/lib/usePullRefresh";

// 受信箱（native formSheet ルート）。RefreshControl は ScrollView 直下の
// prop としてしか機能しないため、ここで持って InboxSheet を包む
// （InboxSheet 自身は同じ queryKey で useQuery しているので、キャッシュ
// 共有により refetch の結果がそのまま反映される）。
export default function InboxRoute() {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const { refreshing, onRefresh } = usePullRefresh(() =>
    queryClient.refetchQueries({ queryKey: ["inbox", userId] }),
  );

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <InboxSheet />
    </ScrollView>
  );
}
