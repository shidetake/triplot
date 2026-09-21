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
    ];
  },
};

export default withNextIntl(nextConfig);
