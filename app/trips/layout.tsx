import { AppHeader } from "@/components/app-header";

// /trips 配下（一覧・詳細・メンバー）に共有ヘッダーを適用。
export default function TripsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
