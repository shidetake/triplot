import { router } from "expo-router";

import { FeedbackSheet } from "@/components/feedback-sheet";
import { FormHostProvider } from "@/components/form-host";
import { SheetScroll } from "@/components/sheet-scroll";

// フィードバック送信（native formSheet ルート）。設定からのドリルイン
// （router.push）。送信成功でこの画面だけ閉じ、設定に戻る。
export default function FeedbackRoute() {
  return (
    <SheetScroll>
      <FormHostProvider draftKey="feedback">
        <FeedbackSheet onDone={() => router.back()} />
      </FormHostProvider>
    </SheetScroll>
  );
}
