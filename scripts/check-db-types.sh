#!/usr/bin/env bash
# コミット済み database.generated.ts が実 DB と一致するか検証する。
# トークンが無い環境（CI / 他コントリビュータ）では警告だけ出して通す。
# トークンがあるのにズレていたら fail する（migration を変えて型再生成を
# 忘れた状態を push 前に止めるのが目的）。
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "check-db-types: .env.local 無し、スキップ" >&2
  exit 0
fi

TOKEN=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- || true)
URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- || true)
REF=$(echo "$URL" | sed -E 's|.*https?://([^.]+)\.supabase\.co.*|\1|')

if [ -z "$TOKEN" ] || [ -z "$REF" ]; then
  echo "check-db-types: トークン無し、スキップ" >&2
  exit 0
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

SUPABASE_ACCESS_TOKEN="$TOKEN" npx supabase gen types typescript \
  --project-id "$REF" > "$TMP" 2>/dev/null

if ! diff -q "$TMP" lib/types/database.generated.ts >/dev/null 2>&1; then
  echo "" >&2
  echo "✖ database.generated.ts が実 DB とズレています。" >&2
  echo "  migration を変えたら \`npm run db:types\` で再生成してコミットしてください。" >&2
  echo "  差分:" >&2
  diff lib/types/database.generated.ts "$TMP" >&2 || true
  exit 1
fi

echo "check-db-types: OK（DB と型が一致）"
