import { AppHeader } from "@/components/app-header";

// 設定ページに共有ヘッダーを適用。
export default function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
