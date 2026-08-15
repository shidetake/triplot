import { useQueryClient } from "@tanstack/react-query";
import { RefreshControl, ScrollView, View } from "react-native";

import { InboxSheet } from "@/components/inbox-sheet";
import { Toaster, useToastBottomClearance } from "@/components/toast";
import { useSession } from "@/lib/session";
import { usePullRefresh } from "@/lib/usePullRefresh";

// 受信箱（native formSheet ルート）。RefreshControl は ScrollView 直下の
// prop としてしか機能しないため、ここで持って InboxSheet を包む
// （InboxSheet 自身は同じ queryKey で useQuery しているので、キャッシュ
// 共有により refetch の結果がそのまま反映される）。
//
// <Toaster /> はこの画面専用にもう1つ持つ。ルートの <Toaster />
// （app/_layout.tsx）は native-stack の presentation:"formSheet" で
// 開いたこの画面自身の view controller には実機で届かない（別の
// ネイティブ画面の裏に回る。シミュレータでは偶然表に出ることがあるが
// 実機 TestFlight では出ない＝実機フィードバックで判明）。toast.tsx の
// スタックにこのローカル Toaster が積まれている間はこちらが優先される。
export default function InboxRoute() {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const { refreshing, onRefresh } = usePullRefresh(() =>
    queryClient.refetchQueries({ queryKey: ["inbox", userId] }),
  );
  const toastClearance = useToastBottomClearance();

  return (
    <View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: toastClearance }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <InboxSheet />
      </ScrollView>
      <Toaster />
    </View>
  );
}
