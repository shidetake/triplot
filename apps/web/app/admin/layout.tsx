import { AppHeader } from "@/components/app-header";

// 管理ページに共有ヘッダーを適用。
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
