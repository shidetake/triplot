# バージョン表記

web・iOS・（将来）Android は**それぞれ独立したバージョン番号**で運用する。
3つを同じ番号に揃えようとしない — マルチプラットフォーム製品では各アプリの
リリースサイクル（web は即時デプロイ、iOS は Apple 審査、Android は Google
審査）が違うのが普通で、番号を無理に同期させる方が不自然（世の中の
マルチプラットフォーム製品も同様）。**どのプラットフォームも git tag は
使わない**（monorepo で複数プラットフォームが同じ `vX.Y.Z` 形式のタグ名を
取り合うと衝突するため。将来どうしても要るなら `ios-v...` のようにプラット
フォーム名を頭に付ける）。

## web

- **本番(production, `main`)**: セマンティックバージョン（`X.Y.Z`）。
  `apps/web/lib/version.generated.ts`（`scripts/gen-web-version.mjs` で
  ローカル生成してコミットする値が単一の真実）を表示する。
  Vercel のビルド環境は shallow clone（浅い履歴取得）のことがあり、ビルド中に
  `git describe` でタグを解決しようとすると失敗し得るため、**値は必ずローカル
  （フル履歴がある環境）で確定させてコミットする**（`db:types` 等と同じ
  「生成してコミット」パターン）。
- **プレビュー(staging 等)・ローカル**: コミットハッシュ先頭7桁
  （Vercel が注入する `VERCEL_GIT_COMMIT_SHA`。ローカルでは未定義なので
  `"dev"`）。プレビューは頻繁に変わり意味のある番号を割り当てる必要が
  無いため、web だけこの1点は非対称（本番=semver・プレビュー=hash）。
- 表示は `components/account-menu.tsx` の `{deployEnv} · {version}`
  （例: `production · 0.1.0` / `preview · a1b2c3d`）。
- リリース手順:
  ```bash
  # 1. staging を main にマージ
  # 2. バージョンを確定してコミット・push
  npm run web:version:generate -- 0.2.0
  git add apps/web/lib/version.generated.ts
  git commit -m "release: 0.2.0"
  git push
  ```

## iOS（mobile）

Apple の App Store Connect は同じマーケティングバージョンに同じビルド番号の
バイナリを二重アップロードできない（＝ビルドのたびに一意な番号が要る）ため、
iOS は**マーケティングバージョン＋ビルド番号の2本立てが実質必須**
（TestFlight 自身もこの2本立てで表示する。SemVer 自体にはビルド番号を括弧で
書く記法は無く、これは Apple/TestFlight のエコシステム慣習）。

- **マーケティングバージョン**（`app.config.ts` の `version`。例 `0.1.0`）:
  人間が実際のリリース区切りで手動で上げる。App Store 掲載ページに出るのは
  こちらだけ。
- **ビルド番号**: `eas.json` の `appVersionSource: "remote"` +
  `autoIncrement: true`（`production`・`preview` 両プロファイルに設定済み）で
  ビルドのたびに自動採番される。**マーケティングバージョンを上げてもリセット
  されない**し、bundle identifier が違う production（`app.triplot.mobile`）と
  preview（`app.triplot.mobile.staging`）で別々にカウントされる（例: 本番=93、
  preview=2、のように無関係に進む）。現在の値は
  `npx eas-cli build:version:get --platform ios --profile <production|preview>`
  で確認できる。
- 表示は「設定 → このアプリについて」（`components/about-sheet.tsx`）に
  `バージョン ${version} (${build})` の形で常に両方出す（production/preview
  で表示形式は変えない。`expo-application` の `nativeApplicationVersion` /
  `nativeBuildVersion` を参照）。preview ビルドをユーザーに渡す時、この
  ビルド番号を伝えれば「今入っているのが最新か」をアプリ内表示と照合できる。
