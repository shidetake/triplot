// Google マップの「共有」→ triplot の共有画面（Share Extension）。
//
// LINE の転送と同じく、triplot を開かずにこの画面の中で旅行を選び、場所を
// 足して閉じる。画面は SwiftUI で描き、判断（場所を引く・足す）は web の
// /api/shared-place が持つ（Edge Function の shared-place が取り次ぐ）。
// React Native をここで動かさないのは、拡張機能は使えるメモリが小さく、
// 一覧とボタンだけの画面に JS の実行環境ごと載せる理由が無いため。
//
// bundle id は以前の共有の拡張機能（expo-share-intent）と同じ
// （<本体>.share-extension）。App ID とプロビジョニングプロファイルをそのまま使う。
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "share",
  name: "triplotShareExtension",
  bundleIdentifier: ".share-extension",
  deploymentTarget: "18.0",
  entitlements: {
    // ログイン状態をアプリ本体と分け合う（src/lib/authSessionStore.ts）。
    "keychain-access-groups": [
      `$(AppIdentifierPrefix)${config.ios.bundleIdentifier}`,
    ],
  },
});
