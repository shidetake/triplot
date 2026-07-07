// Metro の monorepo 設定。@triplot/shared（TS ソース出荷）をリポジトリルート
// 経由で解決・監視できるようにする。SDK 52+ は workspaces を自動検出するが、
// 解決順（app ローカル優先＝react の二重解決防止）を明示しておく。
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
