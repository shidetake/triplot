import Foundation

// 宛先とログイン状態の置き場所。アプリ本体の Info.plist から読む
// （app.config.ts の ios.infoPlist が、ビルドの向き先〔本番 / staging〕に合わせて書く）。
// 拡張機能はアプリ本体の .app の中（PlugIns/）に入っているので、2つ上がアプリ本体。
struct AppConfig {
  let supabaseURL: URL
  let anonKey: String
  let keychainGroup: String

  static func load() -> AppConfig? {
    let hostURL = Bundle.main.bundleURL
      .deletingLastPathComponent()
      .deletingLastPathComponent()
    guard
      let host = Bundle(url: hostURL),
      let urlString = host.object(forInfoDictionaryKey: "TriplotSupabaseURL") as? String,
      let url = URL(string: urlString),
      let anonKey = host.object(forInfoDictionaryKey: "TriplotSupabaseAnonKey") as? String,
      let group = host.object(forInfoDictionaryKey: "TriplotKeychainGroup") as? String,
      !anonKey.isEmpty, !group.isEmpty
    else { return nil }
    return AppConfig(supabaseURL: url, anonKey: anonKey, keychainGroup: group)
  }

  // supabase-js がセッションを置く時のキー（sb-<プロジェクトの ref>-auth-token）。
  var sessionKey: String {
    let ref = supabaseURL.host?.split(separator: ".").first.map(String.init) ?? ""
    return "sb-\(ref)-auth-token"
  }
}
