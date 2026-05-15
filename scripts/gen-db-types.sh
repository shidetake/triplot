#!/usr/bin/env bash
# 実 DB から lib/types/database.generated.ts を再生成する。
# SUPABASE_ACCESS_TOKEN と NEXT_PUBLIC_SUPABASE_URL は .env.local から読む。
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "gen-db-types: .env.local が無い" >&2
  exit 1
fi

TOKEN=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- || true)
URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- || true)
REF=$(echo "$URL" | sed -E 's|.*https?://([^.]+)\.supabase\.co.*|\1|')

if [ -z "$TOKEN" ] || [ -z "$REF" ]; then
  echo "gen-db-types: SUPABASE_ACCESS_TOKEN か URL が取れない" >&2
  exit 1
fi

SUPABASE_ACCESS_TOKEN="$TOKEN" npx supabase gen types typescript \
  --project-id "$REF" > lib/types/database.generated.ts

echo "gen-db-types: lib/types/database.generated.ts を更新した"
