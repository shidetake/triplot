import SwiftUI
import UIKit
import UniformTypeIdentifiers

// 共有画面の入口（Info.plist の NSExtensionPrincipalClass）。共有されたものを
// 取り出して SwiftUI の画面（ShareView）に渡すだけ。
final class ShareViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    let model = ShareModel(close: { [weak self] in
      self?.extensionContext?.completeRequest(returningItems: nil)
    })
    let host = UIHostingController(rootView: ShareView(model: model))
    addChild(host)
    host.view.frame = view.bounds
    host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(host.view)
    host.didMove(toParent: self)

    Task {
      let text = await sharedText()
      await model.start(text: text)
    }
  }

  // Google マップは短縮 URL と店名のテキストを渡す。両方を1つの文字列にして
  // 渡す（場所の引き方は web の側が知っている）。
  private func sharedText() async -> String {
    let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
      .flatMap { $0.attachments ?? [] }
    var parts: [String] = []
    for provider in providers {
      if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
        let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier)
          as? URL
      {
        parts.append(url.absoluteString)
      } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
        let text = try? await provider.loadItem(
          forTypeIdentifier: UTType.plainText.identifier) as? String
      {
        parts.append(text)
      }
    }
    return parts.joined(separator: "\n")
  }
}
