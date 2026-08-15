---
name: ios-preview-build
description: 実機ですぐ確認したい時の内部配布ビルド（staging DB・数十秒でインストール可）。「実機で見たい」「previewビルドして」で使う。AGENTS.md の「iOS の実機確認」2段目・既定の実機確認先。
---

# iOS preview ビルド

TestFlight・App Store Connect を一切通らない内部配布ビルド。「実機で見たい」の**既定**はこれ
（TestFlight は区切りのタイミングだけ。`ios-testflight-build` 参照）。

## 前提（初回のみ）

- 実機の UDID が登録済みか確認（未登録なら `npx eas-cli device:create` → Website 方式で登録）。
- 実機の 設定 → プライバシーとセキュリティ → デベロッパモード が ON。

## 手順

```bash
cd apps/mobile
npx eas-cli build --platform ios --profile preview --local --non-interactive \
  --output ./build/triplot-preview.ipa
```

- `run_in_background: true` で実行。
- **プロファイルは `preview`**（`production` ではない。bundle id が `app.triplot.mobile.staging` になり本番アプリと共存できる。staging Supabase を向く）。

ビルドが終わったらアップロード:

```bash
cd apps/mobile/..
npm run ios:preview:upload -- apps/mobile/build/triplot-preview.ipa
```

（Vercel Blob の `triplot-ios-preview` ストアにアップロードし、`itms-services://...` のインストールリンクを出力する。トークンは repo ルートの `.env.local` の `BLOB_READ_WRITE_TOKEN` から自動で拾う。）

## 結果の伝え方（省略しないこと）

出力された `itms-services://...` リンクを**必ずマークダウンのコードブロック（\`\`\`）で囲んで**そのまま貼る。

- QR コードは作らない（画像を送る一手間が増えるだけで不採用の判断済み）。
- コードブロックにする理由: リンクとして装飾されるとタップ/コピーしにくい・崩れることがあるため、プレーンテキストとしてコピーできる形にする。
- ユーザーには「実機の **Safari** でこのリンクを開いてください」と添える（他アプリ内ブラウザや非対応アプリからのタップは失敗するため）。

例:

```
itms-services://?action=download-manifest&url=https://...
```

実機の Safari でこのリンクを開いてインストールしてください。
