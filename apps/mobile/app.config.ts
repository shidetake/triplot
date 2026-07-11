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
  // OS のライト/ダークに追従（アプリ内にモード設定は置かない）。UI 側は
  // lib/theme.ts のトークンが useColorScheme で切り替わる。
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "app.triplot.mobile",
    supportsTablet: false,
    usesAppleSignIn: true,
    // ローカルビルドの署名チーム（Apple Development 証明書の OU）。
    // 対話プロンプト無しで expo run:ios の署名を通すために明示する。
    appleTeamId: "D37LHZNVW3",
    // 標準暗号（HTTPS）のみ使用＝輸出コンプライアンスの申告を事前に済ませる
    // （TestFlight 提出のたびに質問されるのを防ぐ）。infoPlist を明示しておかないと
    // config-plugins の base mod が undefined 参照で prebuild に失敗する事情もある。
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // 対応言語の宣言。これがあると iOS の 設定 → triplot → 言語 で
      // アプリ単位の言語切替が出る（アプリ内に言語設定は置かない＝OS 追従）。
      CFBundleAllowMixedLocalizations: true,
      CFBundleLocalizations: ["ja", "en"],
      CFBundleDevelopmentRegion: "ja",
    },
    // 注: react-native-maps の iOS Google Maps キーは ios.config.googleMapsApiKey
    // では設定しない。それを使うと Expo 組み込みの旧 Maps プラグインが動いて
    // 旧 pod 名 `react-native-google-maps`（1.27 で `react-native-maps/Google`
    // に改名済み）を Podfile に書き、pod install が失敗する。代わりに下の
    // react-native-maps プラグイン（iosGoogleMapsApiKey）で設定する。
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
    // react-native-maps: iOS の Google Maps キーは自身のプラグインで注入する
    // （Podfile に正しい `react-native-maps/Google` subspec を書く）。キー未設定
    // でも Apple Maps で動くので、キーがある時だけ Google を有効化。
    ...(process.env.GOOGLE_MAPS_IOS_API_KEY
      ? [
          [
            "react-native-maps",
            { iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY },
          ] satisfies [string, unknown],
        ]
      : []),
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
  owner: "hdtk",
  extra: {
    eas: {
      projectId: "9fc880e2-573b-49e9-8279-01418e9c665a",
    },
  },
};

export default config;
