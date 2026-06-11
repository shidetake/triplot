import { AppHeader } from "@/components/app-header";

// 取り込みページに共有ヘッダーを適用。
export default function ImportLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
