#!/bin/bash

# Supabase Data Migration Script
#
# Exports data from Supabase Cloud and imports into self-hosted instance.
# Tables are exported/imported in correct order to respect foreign keys.
#
# Usage:
#   1. Set the connection strings below
#   2. chmod +x scripts/migrate-data.sh
#   3. ./scripts/migrate-data.sh
#
# Prerequisites:
#   - pg_dump and psql must be installed
#   - Schema must already be applied on the target (run schema_dump.sql + migrations first)

set -euo pipefail

# ============================
# CONFIGURATION — EDIT THESE
# ============================

OLD_DB="postgresql://postgres:YOUR_PASSWORD@db.rnbzyxbugmpowkpbtdup.supabase.co:5432/postgres"
NEW_DB="postgresql://postgres:YOUR_PASSWORD@YOUR_SELF_HOSTED_DB_HOST:5432/postgres"

DUMP_DIR="./migration-dumps"

# ============================

mkdir -p "$DUMP_DIR"

echo "=== Supabase Data Migration ==="
echo "  Source: Supabase Cloud"
echo "  Target: Self-hosted"
echo ""

# --------------------------------------------------
# Step 1: Export auth users (must be imported first)
# --------------------------------------------------
echo "[1/4] Exporting auth users..."
pg_dump "$OLD_DB" \
  --data-only \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  -t auth.users \
  -t auth.identities \
  > "$DUMP_DIR/01_auth_dump.sql"
echo "  Saved to $DUMP_DIR/01_auth_dump.sql"

# --------------------------------------------------
# Step 2: Export application data
# --------------------------------------------------
echo "[2/4] Exporting application data..."
pg_dump "$OLD_DB" \
  --data-only \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  -t public.authors \
  -t public.notebooks \
  -t public.notes \
  -t public.collections \
  -t public.collections_notes \
  -t public.shared_notes \
  -t public.shared_notes_readers \
  -t public.shared_notes_analytics \
  -t public.subscriptions \
  > "$DUMP_DIR/02_data_dump.sql"
echo "  Saved to $DUMP_DIR/02_data_dump.sql"

# --------------------------------------------------
# Step 3: Import auth users
# --------------------------------------------------
echo "[3/4] Importing auth users to self-hosted..."
echo "  (This may warn about existing default users — that's OK)"
psql "$NEW_DB" < "$DUMP_DIR/01_auth_dump.sql" || {
  echo "  WARNING: Auth import had errors. Check output above."
  echo "  Common cause: auth.users may already have entries from GoTrue init."
  echo "  You may need to truncate auth.users on the target first."
}

# --------------------------------------------------
# Step 4: Import application data
# --------------------------------------------------
echo "[4/4] Importing application data to self-hosted..."
psql "$NEW_DB" < "$DUMP_DIR/02_data_dump.sql" || {
  echo "  WARNING: Data import had errors. Check output above."
}

echo ""
echo "=== Data migration complete ==="
echo ""
echo "Next steps:"
echo "  1. Run: node scripts/migrate-storage.js   (migrate storage files)"
echo "  2. Run: psql \$NEW_DB < scripts/fix-storage-urls.sql  (fix URLs)"
echo "  3. Update app env vars and redeploy"
echo ""
echo "Dumps saved in $DUMP_DIR/ — keep these as backup until migration is verified."
