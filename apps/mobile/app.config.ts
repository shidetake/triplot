import type { ExpoConfig } from "expo/config";

// triplot モバイルアプリ（iOS/Android 共通、docs/architecture.md の native 系統）。
// 動的 config にしているのは、Google Maps の iOS API キー等を環境変数
// （ローカル .env.local / EAS の env）から注入するため。
const config: ExpoConfig = {
  name: "triplot",
  slug: "triplot",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "triplot",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "app.triplot.mobile",
    supportsTablet: false,
    // react-native-maps (PROVIDER_GOOGLE) 用。M5 で実キーを設定するまで undefined。
    config: process.env.GOOGLE_MAPS_IOS_API_KEY
      ? { googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY }
      : undefined,
  },
  android: {
    package: "app.triplot.mobile",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
  },
  plugins: [
    "expo-router",
    "expo-localization",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#ffffff",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
