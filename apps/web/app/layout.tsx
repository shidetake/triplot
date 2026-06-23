import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: "triplot",
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      // GA オプトアウト等のブラウザ拡張が <html> に属性を注入して
      // ハイドレーション不一致になるため、この要素1階層分だけ抑制する。
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <div className="flex-1">{children}</div>
          <footer className="px-6 py-3 text-center text-xs text-subtle-foreground">
            {getDeployEnv()} · {getVersion()}
          </footer>
          <Toaster />
          <ConfirmDialogHost />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
