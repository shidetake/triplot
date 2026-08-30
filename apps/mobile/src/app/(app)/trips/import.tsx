import { useQueryClient } from "@tanstack/react-query";
import { RefreshControl, View } from "react-native";

import { ImportSheet } from "@/components/import-sheet";
import { SheetScroll } from "@/components/sheet-scroll";
import { Toaster } from "@/components/toast";
import { useSession } from "@/lib/session";
import { usePullRefresh } from "@/lib/usePullRefresh";

// 受信箱（native formSheet ルート）。RefreshControl はスクロール器の
// prop としてしか機能しないため、ここで持って ImportSheet を包む
// （ImportSheet 自身は同じ queryKey で useQuery しているので、キャッシュ
// 共有により refetch の結果がそのまま反映される）。
//
// <Toaster /> はこの画面専用にもう1つ持つ。ルートの <Toaster />
// （app/_layout.tsx）は native-stack の presentation:"formSheet" で
// 開いたこの画面自身の view controller には実機で届かない（別の
// ネイティブ画面の裏に回る。シミュレータでは偶然表に出ることがあるが
// 実機 TestFlight では出ない＝実機フィードバックで判明）。toast() は
// 全ての Toaster に配るので、裏に回ったルート側は見えないだけで害はない。
export default function InboxRoute() {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const { refreshing, onRefresh } = usePullRefresh(() =>
    queryClient.refetchQueries({ queryKey: ["inbox", userId] }),
  );

  return (
    <View>
      <SheetScroll
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <ImportSheet />
      </SheetScroll>
      <Toaster inSheet />
    </View>
  );
}
