// レシートを「どの旅行か」推測する純関数（M3）。
// 設計（合意済み）: これは自動“確定”でなくレビューで確認できる“推測”。
// 旅行A中に買った旅行Bの航空券のように購入日では決まらないので、
// serviceDate（搭乗日/チェックイン日）があればそれを優先して旅程に照合する。
// 0件/複数件は呼び出し側で「要割当」or 候補提示に使う。

export type TripRange = {
  id: string;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
};

// 旅行推測に使う日付。serviceDate（使う日）優先、無ければ購入日。
export function tripMatchDate(receipt: {
  date: string;
  serviceDate: string | null;
}): string {
  const s = receipt.serviceDate?.trim();
  return s && s.length > 0 ? s : receipt.date;
}

// 日付（YYYY-MM-DD）が日程に収まる旅行の id を返す（両端含む）。
// "YYYY-MM-DD" は辞書順比較で日付順になる。
export function matchTripsByDate(date: string, trips: TripRange[]): string[] {
  return trips
    .filter(
      (t) =>
        t.startDate != null &&
        t.endDate != null &&
        t.startDate <= date &&
        date <= t.endDate,
    )
    .map((t) => t.id);
}

export type TripGuess = {
  date: string; // 照合に使った日付
  basis: "service" | "purchase"; // serviceDate を使ったか購入日か
  tripIds: string[]; // 該当旅行（0=要割当, 1=推測, 複数=候補/要確認）
};

// レシート＋ユーザの参加旅行 → 旅行推測。
export function guessTripForReceipt(
  receipt: { date: string; serviceDate: string | null },
  trips: TripRange[],
): TripGuess {
  const date = tripMatchDate(receipt);
  const basis = receipt.serviceDate?.trim() ? "service" : "purchase";
  return { date, basis, tripIds: matchTripsByDate(date, trips) };
}
