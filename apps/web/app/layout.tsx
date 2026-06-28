import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { Toaster } from "@/components/toast";
import { ConfirmDialogHost } from "@/components/confirm-dialog";
import { getDeployEnv, getVersion } from "@/lib/version";
import { resolveTheme } from "@/i18n/theme.server";

// チラつきなしでダークモードを適用するインラインスクリプト。
// Cookie を読み、system の場合は prefers-color-scheme に従う。
// OS テーマ変更もリアルタイムで追従（system 選択時のみ）。
const themeScript = `(function(){try{
  var t=document.cookie.match(/NEXT_THEME=([^;]+)/)?.[1]||'system';
  function ap(d){document.documentElement.classList.toggle('dark',d);}
  if(t==='dark'){ap(true);}
  else if(t==='light'){ap(false);}
  else{var mq=window.matchMedia('(prefers-color-scheme: dark)');ap(mq.matches);mq.addEventListener('change',function(e){ap(e.matches);});}
}catch(e){}})();`;

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
  const theme = await resolveTheme();
  // SSR: explicit dark は即座にクラス付与、system は script に委ねる（OS不明のため）。
  const darkClass = theme === "dark" ? "dark" : "";
  return (
    <html
      lang={locale}
      // GA オプトアウト等のブラウザ拡張が <html> に属性を注入して
      // ハイドレーション不一致になるため、この要素1階層分だけ抑制する。
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${darkClass}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
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
