import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // ワークスペースの TS パッケージ（@triplot/shared）をそのままソースで取り込む。
  transpilePackages: ["@triplot/shared"],
  // iOS の Universal Links（招待リンクをアプリで開く）。Apple が固定パスで
  // 取りに来るファイルを、Content-Type を制御できるルートハンドラに繋ぐ。
  async rewrites() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/apple-app-site-association",
      },
      // 実験用（Smart App Banner の実機確認）。ドットも階層も無い短い入口で、
      // リンク検出やコピペでURLが崩れても届くようにする。実験後に削除する。
      { source: "/lab", destination: "/banner-lab/index.html" },
    ];
  },
};

export default withNextIntl(nextConfig);
