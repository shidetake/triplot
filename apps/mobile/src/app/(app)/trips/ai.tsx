import { AiSheet } from "@/components/ai-sheet";
import { SheetScroll } from "@/components/sheet-scroll";

// AI 連携（native formSheet ルート）。設定からのドリルイン（router.push）。
export default function AiRoute() {
  return (
    <SheetScroll>
      <AiSheet />
    </SheetScroll>
  );
}
