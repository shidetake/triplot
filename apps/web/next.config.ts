import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // ワークスペースの TS パッケージ（@triplot/shared）をそのままソースで取り込む。
  transpilePackages: ["@triplot/shared"],
};

export default withNextIntl(nextConfig);
