// /trips 配下は共通ヘッダーを layout ではなく各ページで描く。
// 旅行詳細のヘッダーだけ旅行名・日程・旅行の操作を載せる必要があり、
// layout はどの旅行かを知らないため（ヘッダーは1本に統合済み）。
export default function TripsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
