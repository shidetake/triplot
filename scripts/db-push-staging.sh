#!/usr/bin/env bash
# staging の Supabase に migration を当てる。
#
# 本番は `supabase link` 済みのプロジェクト（supabase/.temp/project-ref）を見る
# のに対し、staging は **接続文字列を明示して** 当てる。link を張り替える方式に
# しないのは、張り替えたまま本番向けのつもりでコマンドを打つ事故を避けるため
# （どちらを触っているかがコマンドから見て自明であること優先）。
#
# 接続文字列は gitignore された apps/web/.env.staging.local に置く:
#   SUPABASE_STAGING_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
# Supabase ダッシュボードの Connect → Session pooler の文字列をそのまま使う。
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="apps/web/.env.staging.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "db-push-staging: $ENV_FILE が無い" >&2
  echo "  SUPABASE_STAGING_DB_URL=<staging の接続文字列> を書いてください" >&2
  exit 1
fi

DB_URL=$(grep -E '^SUPABASE_STAGING_DB_URL=' "$ENV_FILE" | cut -d= -f2- || true)

if [ -z "$DB_URL" ]; then
  echo "db-push-staging: SUPABASE_STAGING_DB_URL が取れない（$ENV_FILE）" >&2
  exit 1
fi

# 事故防止: 本番の project ref が混ざっていたら止める。
PROD_REF=$(cat supabase/.temp/project-ref 2>/dev/null || true)
if [ -n "$PROD_REF" ] && [[ "$DB_URL" == *"$PROD_REF"* ]]; then
  echo "✖ SUPABASE_STAGING_DB_URL が本番の project ref ($PROD_REF) を指しています。" >&2
  echo "  staging プロジェクトの接続文字列に直してください。" >&2
  exit 1
fi

echo "db-push-staging: staging に migration を適用します"
npx supabase db push --db-url "$DB_URL"
echo "db-push-staging: 完了"
