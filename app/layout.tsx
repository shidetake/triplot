import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/toast";
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
      </body>
    </html>
  );
}
