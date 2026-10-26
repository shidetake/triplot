import Foundation

// web の /api/shared-place（Edge Function の shared-place が取り次ぐ）との往復。
// 場所は中身を解釈せず、受け取った JSON をそのまま送り返す（足す時に Google を
// 二度引かないため。型は @triplot/shared の PlaceCandidate）。

struct SharedPlaceTrip: Decodable, Identifiable {
  let id: String
  let label: String
  let alreadyAdded: Bool
}

struct SharedPlaceLookup {
  let name: String
  let address: String
  let rawPlace: [String: Any]
  let trips: [SharedPlaceTrip]
}

enum SharedPlaceError: Error {
  case notSignedIn
  case notFound
  case failed
}

struct SharedPlaceAPI {
  let config: AppConfig
  let session: SessionStore

  private var endpoint: URL {
    config.supabaseURL.appending(path: "functions/v1/shared-place")
  }

  private func authorized(_ request: URLRequest) async throws -> URLRequest {
    guard let token = try await session.accessToken() else {
      throw SharedPlaceError.notSignedIn
    }
    var request = request
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
    return request
  }

  func lookup(text: String) async throws -> SharedPlaceLookup {
    let url = endpoint.appending(queryItems: [URLQueryItem(name: "text", value: text)])
    let request = try await authorized(URLRequest(url: url))
    let (data, response) = try await URLSession.shared.data(for: request)
    switch (response as? HTTPURLResponse)?.statusCode {
    case 200: break
    case 401: throw SharedPlaceError.notSignedIn
    case 404: throw SharedPlaceError.notFound
    default: throw SharedPlaceError.failed
    }
    guard let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let place = json["place"] as? [String: Any],
      let tripsJSON = json["trips"]
    else { throw SharedPlaceError.failed }
    let trips = try JSONDecoder().decode(
      [SharedPlaceTrip].self,
      from: JSONSerialization.data(withJSONObject: tripsJSON)
    )
    return SharedPlaceLookup(
      name: place["name"] as? String ?? "",
      address: place["formattedAddress"] as? String ?? "",
      rawPlace: place,
      trips: trips
    )
  }

  enum AddResult { case added, exists }

  func add(tripId: String, place: [String: Any]) async throws -> AddResult {
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "tripId": tripId, "place": place,
    ])
    request = try await authorized(request)
    let (data, response) = try await URLSession.shared.data(for: request)
    switch (response as? HTTPURLResponse)?.statusCode {
    case 200: break
    case 401: throw SharedPlaceError.notSignedIn
    default: throw SharedPlaceError.failed
    }
    let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    return json?["result"] as? String == "exists" ? .exists : .added
  }
}
