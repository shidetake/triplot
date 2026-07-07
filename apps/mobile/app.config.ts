import type { ExpoConfig } from "expo/config";

// triplot モバイルアプリ（iOS/Android 共通、docs/architecture.md の native 系統）。
// 動的 config にしているのは、Google Maps の iOS API キーや Google Sign-In の
// URL scheme を環境変数（ローカル .env.local / EAS の env）から注入するため。

// Google Sign-In の iOS 用 URL scheme（= iOS OAuth Client ID の逆順表記
// com.googleusercontent.apps.xxx）。Google Cloud Console で iOS クライアントを
// 作るまでは未設定でよく、その間は plugin ごと外して prebuild を通す
// （サインイン画面も Google ボタンを出さない）。
const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;

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
    usesAppleSignIn: true,
    // 標準暗号（HTTPS）のみ使用＝輸出コンプライアンスの申告を事前に済ませる
    // （TestFlight 提出のたびに質問されるのを防ぐ）。infoPlist を明示しておかないと
    // config-plugins の base mod が undefined 参照で prebuild に失敗する事情もある。
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
    // react-native-maps (PROVIDER_GOOGLE) 用。M5 で実キーを設定するまで空。
    ...(process.env.GOOGLE_MAPS_IOS_API_KEY
      ? { config: { googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY } }
      : {}),
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
    "expo-apple-authentication",
    [
      "expo-build-properties",
      {
        ios: {
          // GoogleSignIn pod の依存（AppCheckCore → GoogleUtilities /
          // RecaptchaInterop）が modular headers を要求し、素の pod install が
          // 失敗するため（static libraries として Swift から import できない）。
          extraPods: [
            { name: "GoogleUtilities", modular_headers: true },
            { name: "RecaptchaInterop", modular_headers: true },
          ],
        },
      },
    ],
    ...(googleIosUrlScheme
      ? [
          [
            "@react-native-google-signin/google-signin",
            { iosUrlScheme: googleIosUrlScheme },
          ] satisfies [string, unknown],
        ]
      : []),
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
