import { LicensesSheet } from "@/components/licenses-sheet";

// OSS ライセンス一覧（native formSheet ルート）。このアプリについて画面から
// のドリルイン（router.push）。中身の FlatList がそのままスクロールする
// （ScrollView で包まない＝FlatList を唯一のスクロール可能な子にする）。
export default function LicensesRoute() {
  return <LicensesSheet />;
}
