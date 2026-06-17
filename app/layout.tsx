import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/toast";
import { ConfirmDialogHost } from "@/components/confirm-dialog";
import { getDeployEnv, getVersion } from "@/lib/version";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "triplot",
  description: "友達と旅行プランを立てて思い出として残すアプリ",
};

// 端まで描画（島・ホームインジケータの裏まで）。これで safe-area-inset が有効化され、
// ボトムシートの dim 等が端まで届く。各所の env(safe-area-inset-*) 余白とセット。
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // GA オプトアウト等のブラウザ拡張が <html> に属性を注入して
      // ハイドレーション不一致になるため、この要素1階層分だけ抑制する。
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="px-6 py-3 text-center text-xs text-subtle-foreground">
          {getDeployEnv()} · {getVersion()}
        </footer>
        <Toaster />
        <ConfirmDialogHost />
      </body>
    </html>
  );
}
