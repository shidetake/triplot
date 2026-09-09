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
npm run ios:build
```

- 必ず `run_in_background: true` で実行し、完了通知を待つ（数十分かかることがある）。
- **`eas-cli` を直に叩かない。** このスクリプトはローカルビルド（クラウドビルドの
  枠は本番用に温存する）を回し、**ログを全文ファイルに残し**（`| tail` に通すと
  失敗の本文が捨てられて成功に見える）、できた ipa をその場で検める。

完了したら出力ログを確認する（パスはスクリプトが最初に出す）:

```bash
grep -n "Incremented buildNumber\|You can find the build artifacts in" <ログのパス>
```

- `Incremented buildNumber from X to Y` の **Y がビルド番号**。
- マーケティングバージョンは `apps/mobile/app.config.ts` の `version` フィールド（`grep version apps/mobile/app.config.ts`）。
- ビルド成果物 `.ipa` のパスもここに出ている（`apps/mobile/build-<timestamp>.ipa`）。

続けて submit:

```bash
npm run ios:submit -- apps/mobile/build-<timestamp>.ipa
```

- こちらも `run_in_background: true` で実行し、完了を待つ。
- **`eas submit` を直に叩かない。** このスクリプトは出す前に ipa の中身を検めて、
  起動に要るフレームワーク（React / ReactNativeDependencies / hermesvm）が欠けて
  いたら止める。上流の配信が落ちている時、**ビルドは成功するのに起動しない
  バイナリ**ができるため（AGENTS.md 参照。実際に TestFlight まで出してしまった）。
- 止まったら回避せず、配信が戻ってからビルドし直す。

## 完了報告（省略しないこと）

**ユーザーから何度も指摘されている点**: ビルド番号を報告し忘れる／聞かれるまで言わない、をやらないこと。
submit が成功したら、次を必ず含めて日本語で報告する:

- バージョン表記は `x.y.z (N)`（`x.y.z` = app.config.ts の version、`N` = 今回インクリメントされたビルド番号）。
- 「Apple の処理に5〜10分かかる、完了メールが届く」旨。
- 確認先: https://appstoreconnect.apple.com/apps/6789780552/testflight/ios

例:「TestFlight に submit しました（0.1.0 (123)）。Apple の処理に5〜10分ほどかかります。」
