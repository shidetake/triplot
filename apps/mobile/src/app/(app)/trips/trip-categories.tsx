import { CategoriesSheet } from "@/components/categories-sheet";
import { SheetScroll } from "@/components/sheet-scroll";
import { useTripIdParam } from "@/lib/useTripIdParam";

// カテゴリ管理（ルート階層の native formSheet ルート）。旅行編集からのドリルイン。
export default function CategoriesRoute() {
  const tripId = useTripIdParam();
  return (
    <SheetScroll>
      <CategoriesSheet tripId={tripId} />
    </SheetScroll>
  );
}
