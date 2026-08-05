# バージョン表記

web・iOS・（将来）Android はそれぞれ独立したバージョン番号で運用する（3つを
同じ番号に揃えようとしない）。**git tag は使わない**（monorepo で複数
プラットフォームが `vX.Y.Z` を取り合うと衝突するため）。

|     | 本番 / TestFlight | プレビュー |
| --- | --- | --- |
| web | `X.Y.Z` | コミットハッシュ先頭7桁 |
| iOS | `X.Y.Z (N)` | `X.Y.Z (N)`（N は別カウンタ） |

**iOS は TestFlight と本番が同じ表記になる。** どちらも `eas.json` の
`production` プロファイル・同じ bundle id（`app.triplot.mobile`）を使うため、
マーケティングバージョンもビルド番号も共通（TestFlight で確認した番号が
そのまま App Store に出る）。preview は別 bundle id
（`app.triplot.mobile.staging`）なので、ビルド番号は独立してカウントされる。

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
