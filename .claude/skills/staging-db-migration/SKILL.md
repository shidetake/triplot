---
name: staging-db-migration
description: supabase migrationをstaging DBにも適用する。新しいmigrationファイルをコミットしたら必ずセットで使う。「migration入れたらstagingにも当てて」で使う。
---

# staging DB への migration 適用

`database.generated.ts` の生成元は本番のまま（`npm run db:types`）。staging と本番で
スキーマが揃っている前提で動いているため、**migration を入れたら両方に当てる**。
片方だけ当て忘れると、staging プレビューだけ古いスキーマで動いて原因不明の不具合に見える。

## 手順

staging に適用:

```bash
npm run db:push:staging
```

- 中身は `scripts/db-push-staging.mjs`。staging だけに絞ったトークン
  （`apps/web/.env.staging.local` の `SUPABASE_ACCESS_TOKEN`）で、
  `supabase-staging/` の link 先（staging）に当てる。link 先が staging でなければ止まる。

本番に適用（本番だけに絞ったトークンで `supabase/` の link 先＝本番に当てる。
**link を張り替えない**——どちらを触っているかがコマンドから自明であることを優先）:

```bash
npm run db:push
```

`npx supabase db push --linked` を直に叩かない（`supabase login` で保存した、
アカウント全体に効くトークンを使ってしまう）。詳しくは docs/development.md の
「Supabase の管理用トークン」。

型を再生成してコミットに含める:

```bash
npm run db:types
git add packages/shared/src/types/database.generated.ts
```

pre-push の `db:types:check` が実DBとのズレを検出して push を止める仕組みなので、
再生成を忘れても気付けるが、先に自分で気付いて直しておく方が手戻りがない。

## 適用順序の目安

新規 migration を書いたら: ローカルで動作確認 → staging に適用（このスキル）→
`web-staging-deploy` で staging ブランチに push してプレビュー確認 → 本番マージの
タイミングで本番DBにも適用（`web-production-deploy` の一部として、または単独で）。
