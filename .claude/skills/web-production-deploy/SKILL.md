---
name: web-production-deploy
description: web の変更を main に PR で入れて本番公開する。stagingでの確認が済み、ユーザーの明示的なGOがある時だけ使う。「本番に出して」「mainにマージして」「公開して」で使う。
---

# web の本番デプロイ

`main` に入る＝本番公開（`triplot.app`）。**staging でユーザー自身が確認し、
明示的にマージの許可を得てから**実行する——iOS の TestFlight ビルドや web の staging
デプロイと違い、ここは**ユーザーの指示なしに進めない**（AGENTS.md 明記）。

`main` へは PR からしか入れない（ブランチ保護が管理者にも効く。直接 push は弾かれる）。
**staging を main にマージしない** —— staging には squash 前のコミットや他の確認中の変更が
混ざっている。PR は作業ブランチから出す。

## 手順（確認・許可が済んでいる場合）

1. migration を含む変更で本番 DB にまだ当てていなければ、先に `npm run db:push`
   （本番だけに絞ったトークンで当てる）。
2. 作業ブランチを push し、PR を作って自動マージを掛ける:

   ```bash
   git push -u origin <作業ブランチ>
   gh pr create --base main --fill   # 本文に closes #番号 があれば書く
   gh pr merge --auto --squash
   ```

- push 時に pre-push フックが走る。失敗したら `--no-verify` で回避せず原因を直す。
- CI と Vercel のビルドが通り、main の最新を取り込んだ状態になると入る（古くなったら
  `update-pr-branches` のワークフローが取り込ませる）。

## 完了報告

- PR の URL と、自動マージを掛けたことを伝える。入ったら数分で本番に反映される。
