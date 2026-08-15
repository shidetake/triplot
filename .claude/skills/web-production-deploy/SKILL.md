---
name: web-production-deploy
description: web の変更を main にマージ&pushして本番公開する。stagingでの確認が済み、ユーザーの明示的なGOがある時だけ使う。「本番に出して」「mainにマージして」「公開して」で使う。
---

# web の本番デプロイ

`main` への push＝即座に本番公開（`triplot.app`）。**staging でユーザー自身が確認し、
明示的にマージの許可を得てから**実行する——iOS の TestFlight ビルドや web の staging
デプロイと違い、ここは**ユーザーの指示なしに進めない**（AGENTS.md 明記）。

## 例外: モバイルのみの変更で作業ブランチがすでに main の場合

Vercel/web に影響しないモバイル専用の変更は、この確認プロセスの対象外
（`web-staging-deploy` の「モバイルのみの変更は対象外」と対）。作業がそもそも
`main` ブランチ上で行われている実務上の運用と整合させる。

## 手順（web の変更で、確認・許可が済んでいる場合）

```bash
git status
git checkout main
git merge staging --ff-only
git push origin main
```

- push 時に pre-push フック（lint + typecheck + test + `db:types:check`）が走る。
  失敗したら `--no-verify` で回避せず原因を直す。
- migration を含む変更で本番DBにまだ当てていなければ、通常の
  `supabase db push --linked`（link済みプロジェクト＝本番を見る）を先に済ませる。

## 完了報告

- 本番反映が完了したことを伝える（Vercel の自動デプロイなので push 後数分で反映）。
- バージョン表記が関わるリリース（`docs/versioning.md`）なら、web は
  `npm run web:version:generate -- X.Y.Z` で `apps/web/lib/version.generated.ts` を
  生成・コミットしてから push する一手順も忘れないこと。
