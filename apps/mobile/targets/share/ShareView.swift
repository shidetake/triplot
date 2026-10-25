import SwiftUI

// 共有画面の状態。旅行を選んだら足して、結果を少し見せてから閉じる
// （LINE の転送と同じ「選んだら終わり」。アプリを開く導線は置かない）。
@MainActor
final class ShareModel: ObservableObject {
  enum Phase {
    case loading
    case ready(SharedPlaceLookup)
    case saving(SharedPlaceLookup, tripId: String)
    case done(LocalizedStringResource)
    case failed(LocalizedStringResource)
  }

  @Published var phase: Phase = .loading
  let close: () -> Void
  private var api: SharedPlaceAPI?

  init(close: @escaping () -> Void) {
    self.close = close
  }

  func start(text: String) async {
    guard let config = AppConfig.load() else {
      phase = .failed("failed")
      return
    }
    let api = SharedPlaceAPI(config: config, session: SessionStore(config: config))
    self.api = api
    do {
      phase = .ready(try await api.lookup(text: text))
    } catch let error as SharedPlaceError {
      phase = .failed(Self.message(for: error))
    } catch {
      phase = .failed("failed")
    }
  }

  func pick(_ trip: SharedPlaceTrip) async {
    guard case .ready(let lookup) = phase, let api else { return }
    phase = .saving(lookup, tripId: trip.id)
    do {
      let result = try await api.add(tripId: trip.id, place: lookup.rawPlace)
      phase = .done(result == .exists ? "alreadyAdded" : "added")
      // 結果を読める間だけ見せて閉じる。
      try? await Task.sleep(for: .seconds(1))
      close()
    } catch let error as SharedPlaceError {
      phase = .failed(Self.message(for: error))
    } catch {
      phase = .failed("failed")
    }
  }

  private static func message(for error: SharedPlaceError) -> LocalizedStringResource {
    switch error {
    case .notSignedIn: "notSignedIn"
    case .notFound: "notFound"
    case .failed: "failed"
    }
  }
}

struct ShareView: View {
  @ObservedObject var model: ShareModel

  var body: some View {
    NavigationStack {
      content
        .navigationTitle(Text("title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("cancel", action: model.close)
          }
        }
    }
  }

  @ViewBuilder
  private var content: some View {
    switch model.phase {
    case .loading:
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    case .ready(let lookup):
      list(lookup, savingTripId: nil)
    case .saving(let lookup, let tripId):
      list(lookup, savingTripId: tripId)
    case .done(let message):
      VStack(spacing: 12) {
        Image(systemName: "checkmark.circle.fill")
          .font(.system(size: 48))
          .foregroundStyle(.tint)
        Text(message).font(.headline)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    case .failed(let message):
      Text(message)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private func list(_ lookup: SharedPlaceLookup, savingTripId: String?) -> some View {
    List {
      // 何を入れようとしているかを先に見せる（どの旅行に入れるか決める材料）。
      Section {
        VStack(alignment: .leading, spacing: 2) {
          Text(lookup.name).font(.body.weight(.semibold))
          if !lookup.address.isEmpty {
            Text(lookup.address)
              .font(.footnote)
              .foregroundStyle(.secondary)
              .lineLimit(2)
          }
        }
      }
      Section {
        if lookup.trips.isEmpty {
          Text("noTrips").foregroundStyle(.secondary)
        }
        ForEach(lookup.trips) { trip in
          Button {
            Task { await model.pick(trip) }
          } label: {
            HStack {
              Text(trip.label).foregroundStyle(.primary)
              Spacer()
              if savingTripId == trip.id {
                ProgressView()
              } else if trip.alreadyAdded {
                Text("added.badge")
                  .font(.footnote)
                  .foregroundStyle(.secondary)
              }
            }
          }
          .disabled(savingTripId != nil)
        }
      }
    }
  }
}
