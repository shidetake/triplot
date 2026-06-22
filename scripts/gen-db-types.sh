#!/usr/bin/env bash
# 実 DB から DB 型定義を再生成する。
# SUPABASE_ACCESS_TOKEN と NEXT_PUBLIC_SUPABASE_URL は ENV_FILE から読む。
set -euo pipefail

cd "$(dirname "$0")/.."

# モノレポのパス（変わったらここだけ直す）
ENV_FILE="apps/web/.env.local"
OUT="apps/web/lib/types/database.generated.ts"

if [ ! -f "$ENV_FILE" ]; then
  echo "gen-db-types: $ENV_FILE が無い" >&2
  exit 1
fi

TOKEN=$(grep -E '^SUPABASE_ACCESS_TOKEN=' "$ENV_FILE" | cut -d= -f2- || true)
URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2- || true)
REF=$(echo "$URL" | sed -E 's|.*https?://([^.]+)\.supabase\.co.*|\1|')

if [ -z "$TOKEN" ] || [ -z "$REF" ]; then
  echo "gen-db-types: SUPABASE_ACCESS_TOKEN か URL が取れない" >&2
  exit 1
fi

SUPABASE_ACCESS_TOKEN="$TOKEN" npx supabase gen types typescript \
  --project-id "$REF" > "$OUT"

echo "gen-db-types: $OUT を更新した"
