# バージョン表記

web・iOS・（将来）Android はそれぞれ独立したバージョン番号で運用する（3つを
同じ番号に揃えようとしない。下表で `X.Y.Z` / `x.y.z` と文字を変えているのは
それを強調するため＝値としても別物で、同じにする意図はない）。
**git tag は使わない**（monorepo で複数プラットフォームが `vX.Y.Z` を取り合う
と衝突するため）。

|     | 本番 / TestFlight | プレビュー |
| --- | --- | --- |
| web | `X.Y.Z` | コミットハッシュ先頭7桁 |
| iOS | `x.y.z (N)` | `x.y.z (M)` |
| Android | 未着手・表記未定 | 未着手・表記未定 |

`N` と `M` も別カウンタである（同じ数字ではない）ことを示すために書き分けて
いる。マーケティングバージョン（`x.y.z` 等）自体は本番/プレビューで**同じ**
（アプリ内の1つの設定値を両方が読むため）だが、ビルド番号だけは bundle id が
違う分、独立してカウントされる。

**Android は着手時に決める。** Android は `versionName`（任意の文字列）と
`versionCode`（Play Store 内部管理用の整数、ユーザ表示は前提にない）という
iOS/web とは別の仕組みを持つため、「セマンティックバージョン + 括弧書き
ビルド番号」を流用できると決まっているわけではない。ここで先取りして具体的な
表記を書かない（着手時に Android の実際の仕組みを見て決める）。

**iOS は TestFlight と本番が同じ表記になる。** どちらも `eas.json` の
`production` プロファイル・同じ bundle id（`app.triplot.mobile`）を使うため、
マーケティングバージョンもビルド番号も共通（TestFlight で確認した番号が
そのまま App Store に出る）。preview は別 bundle id
（`app.triplot.mobile.staging`）なので、ビルド番号（`M`）は独立してカウント
される。

## 値の出どころ

- **web 本番**: `apps/web/lib/version.generated.ts`（`npm run
  web:version:generate -- X.Y.Z` で生成してコミットする値が単一の真実）。
  表示は `components/account-menu.tsx`。
- **iOS**: マーケティングバージョンは `app.config.ts` の `version`（手動で
  上げる）。ビルド番号は `eas.json` の `autoIncrement`（ビルドのたびに自動）。
  表示は「設定 → このアプリについて」（`components/about-sheet.tsx`）。

## web のリリース手順

```bash
# 1. staging を main にマージ
# 2. バージョンを確定してコミット・push
npm run web:version:generate -- 0.2.0
git add apps/web/lib/version.generated.ts
git commit -m "release: 0.2.0"
git push
```
