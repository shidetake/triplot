---
name: web-staging-deploy
description: web の変更を staging ブランチにマージ&pushしてVercel Previewで確認できる状態にする。「stagingに上げて」「確認できる状態にして」で使う。AGENTS.mdの「webの動作確認はstagingで行う」。
---

# web の staging デプロイ

`main` への push＝本番公開なので、リリースまでの確認は staging（Vercel Preview）で行う。

## 前提

- web の画面に見える変更が一段落し、typecheck / lint / test が通っていること（「区切り」）。
- これが揃っているなら、**ユーザーの指示を待たず判断で staging へマージ&pushしてよい**
  （AGENTS.md 既定方針。iOS を preview ビルドに上げるのと同じ考え方）。
- **`main` へのマージは別スキル（`web-production-deploy`）で、こちらは確認が済むまで実行しない**。

## モバイルのみの変更は対象外

この手順は **web（Next.js）に影響する変更**の話。iOS/RN のみの変更は Vercel と無関係なので
staging を経由する必要はなく、作業ブランチが `main` ならそのまま commit push してよい
（このリポジトリでの実例: 費用一覧のRN側UI変更はstagingを経由せず直接mainにpushした）。

## 手順

```bash
git status   # 作業ツリーがクリーンであることを確認
git checkout staging
git merge <作業ブランチ> --ff-only
git push origin staging
```

- `--ff-only` が失敗する（fast-forwardできない）場合は `git merge <作業ブランチ>` の通常マージで可。
  コンフリクトが出たら安易に上書きせず内容を確認して解決する。
- migration を含む変更なら、続けて `staging-db-migration` スキルで staging DB にも適用する
  （当て忘れるとプレビューだけ古いスキーマで原因不明の不具合に見える）。

## 完了報告

プレビューURLを必ず伝える:

```
https://triplot-git-staging-hdtks-projects.vercel.app
```

（Vercel Authentication が有効＝Vercelにログイン済みのチームメンバーだけが開ける。
ブランチ固定URLなのでGoogle OAuthにも登録済み。）

Googleカレンダーエクスポート機能の確認が必要な変更なら、「JavaScript生成元の制約で
staging以外のプレビューでは動かないため、確認はこのstaging URLで」と一言添える。
