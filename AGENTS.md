<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Server Action は完了後に自動でページを再レンダリングする

Next.js App Router は Server Action 完了後、`revalidatePath` の有無に関わらず
React が自動的にページを再レンダリングする。その際 `<html>` 等のサーバー側属性が
DOM に書き戻される。

**やってはいけないパターン**: クライアント JS で `<html class>` を変更した後に
Server Action を呼ぶと、その変更が再レンダリングで消える。

```tsx
// NG: テーマ切替を Server Action 経由にすると React が dark クラスを上書きして消す
await setThemeAction(value);  // → 再レンダリング → <html class=""> で dark 消える
```

**正しいパターン**: サーバー描画コンテンツが変わらない変更（CSS クラス・
ユーザー設定 Cookie 等）は Server Action を使わず `document.cookie` で直書きする。

```tsx
// OK: クライアントから直接 Cookie に書く → 再レンダリングなし → クラスが消えない
document.cookie = `NEXT_THEME=${value}; path=/; max-age=...`;
```

Server Action が必要なのは、サーバー描画コンテンツ（翻訳テキスト等）が
変わる場合だけ（例: `setLocaleAction` は `revalidatePath` が必要）。

## iOS アプリの動作確認は TestFlight で行う

シミュレータでの確認は補助にすぎない（開発ビルド限定の要素が実機と違う挙動を
する。例: expo-dev-client の Tools ボタンが画面右上のタップを吸い、検索窓の ×
が効かないように見える）。**iOS の動作確認は TestFlight に上げて実機で行う。**

- **区切りのタイミングでは、指示を待たず Claude Code の判断でビルドして submit
  まで進める。** 「区切り」＝ iOS の画面に見える変更が一段落し、typecheck /
  lint / テストが通っている状態。
- **TestFlight 用（動作確認用）のビルドはローカルビルドにする。** EAS のビルド枠
  が余っていてもローカルを使い、枠は本番用に温存する。

  ```bash
  cd apps/mobile
  npx eas-cli build --platform ios --profile production --local --non-interactive
  npx eas-cli submit --platform ios --path build-<timestamp>.ipa --non-interactive
  ```

- **本番（市場リリース）用のビルドはクラウドビルドにする**（`--local` を付けない）。
  ローカルビルドは Mac の状態（Xcode の版・キーチェーン・node_modules への
  パッチ適用）に結果が左右されるので、公開するバイナリはクリーンな環境で作る。
- `eas submit` は App Store Connect へのアップロードまで。公開には App Store
  Connect で別途バージョンを作って審査に出す操作が要るので、submit しただけで
  市場に出ることはない。ビルド番号は `eas.json` の `autoIncrement` が自動で
  上げる（バージョン文字列だけは `app.config.ts` の `version` を手で上げる）。

ローカルビルドには Xcode 26.3 以上 / fastlane / login キーチェーンに Apple WWDR
G3 中間証明書が要る。`patches/` の expo-modules-jsi パッチ（Xcode 26.3 の Swift
で `abs` が曖昧になる上流バグ）は root の postinstall で自動適用される。
