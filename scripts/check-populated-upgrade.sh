#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${UPGRADE_DATABASE_URL:?UPGRADE_DATABASE_URL is required}"
node -e 'const a=new URL(process.env.DATABASE_URL), b=new URL(process.env.UPGRADE_DATABASE_URL); if(a.hostname!==b.hostname || !["127.0.0.1","localhost","postgres"].includes(b.hostname) || !a.pathname.endsWith("/balance_test") || !b.pathname.endsWith("/balance_upgrade_test")) { throw new Error("Upgrade check requires isolated balance_test and balance_upgrade_test databases on the same local host") }'

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
cp -R prisma "$tmp_dir/prisma"
rm -r "$tmp_dir/prisma/migrations/20261006120000_financial_integrity_oauth_identity"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'CREATE DATABASE balance_upgrade_test'
DATABASE_URL="$UPGRADE_DATABASE_URL" npx prisma migrate deploy --schema "$tmp_dir/prisma/schema.prisma"
psql "$UPGRADE_DATABASE_URL" -v ON_ERROR_STOP=1 -f test/fixtures/legacy-upgrade.sql
DATABASE_URL="$UPGRADE_DATABASE_URL" npx prisma migrate deploy

actual=$(psql "$UPGRADE_DATABASE_URL" -tAc 'SELECT (SELECT count(*) FROM "Transation" WHERE "userId" = '\''upgrade-user-a'\'')::text || '\'','\'' || (SELECT count(*) FROM "FixedCostMonthly" WHERE "fixedCostId" = '\''upgrade-fixed-a'\'')::text || '\'','\'' || (SELECT count(*) FROM "Transation" WHERE "installmentGroupId" IS NULL AND "userId" = '\''upgrade-user-a'\'')::text')
test "$actual" = "2,1,2"
echo "Populated upgrade preserved 2 transactions, 1 monthly row and 2 ungrouped legacy installments."
