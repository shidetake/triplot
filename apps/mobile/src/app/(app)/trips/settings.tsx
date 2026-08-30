import { router, useLocalSearchParams } from "expo-router";

import { SettingsSheet } from "@/components/settings-sheet";
import { SheetScroll } from "@/components/sheet-scroll";

// 設定（native formSheet ルート）。フィードバックは兄弟ルートへの
// router.push（旧 stackBehavior="push" 相当のドリルイン）。
//
// 旅行詳細のヘッダーから開いた時は tripId が付く。その時だけ「旅行を編集」の
// 行を出す（旧・歯車アイコンの行き先）。
export default function SettingsRoute() {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();

  // 旅行の編集シートは**旅行の入れ子スタック**のルートなので、この設定シート
  // （ルート階層）から直接 push すると旅行詳細ごと新しい画面として積まれ、
  // シートではなく「旅行のナビバー付きの画面」になってしまう（実機で確認）。
  // 一度この設定シートを閉じて旅行詳細に戻し、遷移が落ち着いてから開く。
  return (
    <SheetScroll>
      <SettingsSheet
        onDone={() => router.back()}
        onOpenFeedback={() => router.push("/trips/feedback")}
        onOpenAbout={() => router.push("/trips/about")}
        onOpenTrip={
          tripId
            ? () => router.push(`/trips/trip-edit?tripId=${tripId}`)
            : undefined
        }
      />
    </SheetScroll>
  );
}
