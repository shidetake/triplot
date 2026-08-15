---
name: ios-testflight-build
description: iOS の動作確認用ビルドを TestFlight に上げる（ローカルビルド + submit）。「TestFlightに上げて」「区切りだからビルドして」「TestFlightビルドして」で使う。AGENTS.md の「iOS の実機確認」3段目。
---

# iOS TestFlight 確認ビルド

**動作確認用**のビルド。市場公開用（App Store 本番）は `ios-release-build` を使う——別物。

## 前提

- preview ビルド（`ios-preview-build`）で一通り確認できていること。
- typecheck / lint / test が通っていること。
- 機能追加やバグ修正の「区切り」がついていること（AGENTS.md の定義）。
- これらが揃っているなら、**ユーザーの指示を待たず判断でビルド〜submitまで進めてよい**（AGENTS.md 既定方針）。

## 手順

```bash
cd apps/mobile
npx eas-cli build --platform ios --profile production --local --non-interactive
```

- 必ず `run_in_background: true` で実行し、完了通知を待つ（数十分かかることがある）。
- **`--local` を必ず付ける**（TestFlight確認はローカルビルドが既定。クラウドビルドの枠は本番用に温存する）。

完了したら出力ログを確認する:

```bash
grep -n "Incremented buildNumber\|You can find the build artifacts in" <出力ログのパス>
```

- `Incremented buildNumber from X to Y` の **Y がビルド番号**。
- マーケティングバージョンは `apps/mobile/app.config.ts` の `version` フィールド（`grep version apps/mobile/app.config.ts`）。
- ビルド成果物 `.ipa` のパスもここに出ている（`apps/mobile/build-<timestamp>.ipa`）。

続けて submit:

```bash
cd apps/mobile
npx eas-cli submit --platform ios --path <ipaのパス> --non-interactive
```

- こちらも `run_in_background: true` で実行し、完了を待つ。

## 完了報告（省略しないこと）

**ユーザーから何度も指摘されている点**: ビルド番号を報告し忘れる／聞かれるまで言わない、をやらないこと。
submit が成功したら、次を必ず含めて日本語で報告する:

- バージョン表記は `x.y.z (N)`（`x.y.z` = app.config.ts の version、`N` = 今回インクリメントされたビルド番号）。
- 「Apple の処理に5〜10分かかる、完了メールが届く」旨。
- 確認先: https://appstoreconnect.apple.com/apps/6789780552/testflight/ios

例:「TestFlight に submit しました（0.1.0 (123)）。Apple の処理に5〜10分ほどかかります。」
