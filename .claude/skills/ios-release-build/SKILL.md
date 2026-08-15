---
name: ios-release-build
description: App Store 本番公開用のビルド（クラウドビルド＋submit）。TestFlight確認ビルドとは別物 — ローカル/クラウドが逆で、バージョン文字列を手動で上げる。「本番リリースして」「App Storeに出す」「マーケティングバージョン上げてリリース」で使う。
---

# iOS 本番リリースビルド

**市場公開用**。TestFlight での動作確認用ビルド（`ios-testflight-build`）とはローカル/クラウドが
**逆**になる点に注意——ここを混同しない:

| | プロファイル | ビルド方式 | 用途 |
|---|---|---|---|
| `ios-testflight-build` | production | **ローカル** | 動作確認だけ。EASのクラウド枠を使わない |
| `ios-release-build`（このスキル） | production | **クラウド**（`--local` を付けない） | 市場公開。Macの状態（Xcode版・キーチェーン等）に結果が左右されないクリーンな環境でビルドする |

## 前提

- TestFlight で動作確認済みの「区切り」がついていること。
- **バージョンを上げる新リリースの場合は、`apps/mobile/app.config.ts` の `version` を上げる前に
  ユーザーに確認する**（`0.1.0`→`0.2.0` 等、セマンティックバージョンの上げ幅はリリース内容次第で
  ユーザー判断が入りうるため。[docs/versioning.md](/docs/versioning.md) 参照）。
- ビルド番号（`N`）は `eas.json` の `autoIncrement` が自動で上げるので手動操作不要。

## 手順

バージョンを上げる場合、先に:

```bash
# apps/mobile/app.config.ts の version を編集してコミット
```

ビルド（クラウド・`--local` を付けない）:

```bash
cd apps/mobile
npx eas-cli build --platform ios --profile production --non-interactive
```

- `run_in_background: true` で実行。クラウドビルドはローカルより時間がかかることがある。

submit:

```bash
npx eas-cli submit --platform ios --latest --non-interactive
```

## 完了報告（省略しないこと）

- バージョン表記 `x.y.z (N)` を必ず報告する（`ios-testflight-build` と同じ理由・同じ形式）。
- **`eas submit` は App Store Connect へのアップロードまで**。公開には App Store Connect で
  別途バージョンを作って審査に出す操作が要ることを必ず伝える（submit しただけで市場に出ることは
  ない）。
- 確認先: https://appstoreconnect.apple.com/apps/6789780552/testflight/ios
