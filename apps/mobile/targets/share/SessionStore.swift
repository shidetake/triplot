import Foundation
import Security

// アプリ本体と分け合うログイン状態（Supabase のセッション）の読み書き。
//
// 置き方はアプリ本体の expo-secure-store に合わせる（src/lib/authSessionStore.ts）:
//   - サービス名: "triplot.session:no-auth"（expo-secure-store は認証なしの項目に
//     ":no-auth" を付ける）
//   - アカウント: supabase-js のキー（sb-<ref>-auth-token）の UTF-8
//   - グループ: チーム ID.本体の bundle id
// 中身は supabase-js が書く JSON（access_token・refresh_token・expires_at …）。
struct SessionStore {
  let config: AppConfig

  private var baseQuery: [String: Any] {
    let account = Data(config.sessionKey.utf8)
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "triplot.session:no-auth",
      kSecAttrAccount as String: account,
      kSecAttrGeneric as String: account,
      kSecAttrAccessGroup as String: config.keychainGroup,
    ]
  }

  func read() -> [String: Any]? {
    var query = baseQuery
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    query[kSecReturnData as String] = kCFBooleanTrue
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data
    else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }

  func write(_ session: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: session) else { return }
    SecItemUpdate(
      baseQuery as CFDictionary,
      [kSecValueData as String: data] as CFDictionary
    )
  }

  // 使えるアクセストークンを返す。期限が近ければ取り直して書き戻す
  // （アプリ本体は次にセッションを使う時にここから読み直すので、取り直した
  // トークンをそのまま使う）。ログインしていなければ nil。
  func accessToken() async throws -> String? {
    guard var session = read(),
      let refreshToken = session["refresh_token"] as? String
    else { return nil }

    let expiresAt = (session["expires_at"] as? NSNumber)?.doubleValue ?? 0
    // supabase-js と同じく、期限の少し前から取り直す。
    if let token = session["access_token"] as? String,
      expiresAt - Date().timeIntervalSince1970 > 60
    {
      return token
    }

    var request = URLRequest(
      url: config.supabaseURL.appending(path: "auth/v1/token")
        .appending(queryItems: [URLQueryItem(name: "grant_type", value: "refresh_token")])
    )
    request.httpMethod = "POST"
    request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "refresh_token": refreshToken
    ])
    let (data, response) = try await URLSession.shared.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode == 200,
      let fresh = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let token = fresh["access_token"] as? String
    else { return nil }

    for (key, value) in fresh { session[key] = value }
    if session["expires_at"] == nil, let expiresIn = fresh["expires_in"] as? NSNumber {
      session["expires_at"] = Int(Date().timeIntervalSince1970) + expiresIn.intValue
    }
    write(session)
    return token
  }
}
