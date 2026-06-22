import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ワークスペースの TS パッケージ（@triplot/shared）をそのままソースで取り込む。
  transpilePackages: ["@triplot/shared"],
};

export default nextConfig;
