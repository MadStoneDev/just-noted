#!/bin/bash

# ============================================
# JustNoted: Migrate from Supabase Cloud to Self-Hosted (Coolify)
# ============================================
#
# BEFORE RUNNING:
# 1. Set the connection strings below
# 2. Make sure both databases are accessible from this machine
# 3. Make sure the self-hosted Supabase is running and healthy
#
# USAGE:
#   chmod +x scripts/migrate-to-coolify.sh
#   ./scripts/migrate-to-coolify.sh

set -e

# ============================================
# CONFIGURATION — FILL THESE IN
# ============================================

# Supabase Cloud (source)
# Get from: Supabase Dashboard → Settings → Database → Connection string (URI)
SOURCE_DB="postgresql://postgres.[project-ref]:[password]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres"

# Coolify Self-Hosted (destination)
# Get from: Coolify → Supabase service → Environment variables
# Usually: postgresql://postgres:[password]@[coolify-host]:5432/postgres
DEST_DB="postgresql://postgres:[password]@[your-coolify-host]:5432/postgres"

DUMP_DIR="./scripts/migration-dump"

# ============================================
# STEP 0: Create dump directory
# ============================================
echo "📁 Creating dump directory..."
mkdir -p "$DUMP_DIR"

# ============================================
# STEP 1: Export schema from cloud (public schema only)
# ============================================
echo ""
echo "📤 Step 1: Exporting public schema..."
pg_dump "$SOURCE_DB" \
  --schema=public \
  --schema-only \
  --no-owner \
  --no-privileges \
  --no-comments \
  -f "$DUMP_DIR/01-public-schema.sql"
echo "   ✓ Schema exported"

# ============================================
# STEP 2: Export public schema data
# ============================================
echo ""
echo "📤 Step 2: Exporting public data..."
pg_dump "$SOURCE_DB" \
  --schema=public \
  --data-only \
  --no-owner \
  --no-privileges \
  --column-inserts \
  -f "$DUMP_DIR/02-public-data.sql"
echo "   ✓ Data exported"

# ============================================
# STEP 3: Export auth users
# ============================================
echo ""
echo "📤 Step 3: Exporting auth users..."
pg_dump "$SOURCE_DB" \
  --table=auth.users \
  --table=auth.identities \
  --table=auth.sessions \
  --table=auth.refresh_tokens \
  --table=auth.mfa_factors \
  --table=auth.mfa_challenges \
  --data-only \
  --no-owner \
  --no-privileges \
  --column-inserts \
  -f "$DUMP_DIR/03-auth-data.sql"
echo "   ✓ Auth data exported"

# ============================================
# STEP 4: Export storage metadata
# ============================================
echo ""
echo "📤 Step 4: Exporting storage metadata..."
pg_dump "$SOURCE_DB" \
  --table=storage.buckets \
  --table=storage.objects \
  --data-only \
  --no-owner \
  --no-privileges \
  --column-inserts \
  -f "$DUMP_DIR/04-storage-metadata.sql"
echo "   ✓ Storage metadata exported"

# ============================================
# STEP 5: Import into self-hosted
# ============================================
echo ""
echo "📥 Step 5: Importing public schema..."
psql "$DEST_DB" -f "$DUMP_DIR/01-public-schema.sql" 2>&1 | grep -E "ERROR|NOTICE" || true
echo "   ✓ Schema imported"

echo ""
echo "📥 Step 6: Importing public data..."
psql "$DEST_DB" -f "$DUMP_DIR/02-public-data.sql" 2>&1 | grep -E "ERROR|NOTICE" || true
echo "   ✓ Data imported"

echo ""
echo "📥 Step 7: Importing auth users..."
# Disable triggers temporarily to avoid auth hooks firing during import
psql "$DEST_DB" -c "ALTER TABLE auth.users DISABLE TRIGGER ALL;" 2>/dev/null || true
psql "$DEST_DB" -c "ALTER TABLE auth.identities DISABLE TRIGGER ALL;" 2>/dev/null || true
psql "$DEST_DB" -f "$DUMP_DIR/03-auth-data.sql" 2>&1 | grep -E "ERROR" || true
psql "$DEST_DB" -c "ALTER TABLE auth.users ENABLE TRIGGER ALL;" 2>/dev/null || true
psql "$DEST_DB" -c "ALTER TABLE auth.identities ENABLE TRIGGER ALL;" 2>/dev/null || true
echo "   ✓ Auth data imported"

echo ""
echo "📥 Step 8: Importing storage metadata..."
psql "$DEST_DB" -f "$DUMP_DIR/04-storage-metadata.sql" 2>&1 | grep -E "ERROR" || true
echo "   ✓ Storage metadata imported"

# ============================================
# STEP 6: Run JustNoted migrations
# ============================================
echo ""
echo "📥 Step 9: Running JustNoted migrations..."
for f in supabase/migrations/*.sql; do
  echo "   Running $f..."
  psql "$DEST_DB" -f "$f" 2>&1 | grep -E "ERROR" || true
done
echo "   ✓ Migrations applied"

# ============================================
# DONE
# ============================================
echo ""
echo "============================================"
echo "✅ Migration complete!"
echo ""
echo "Next steps:"
echo "  1. Update .env.local with new Supabase URL and keys"
echo "  2. Download storage files from cloud and upload to self-hosted"
echo "     (notebook covers and avatars — see scripts/migrate-storage.js)"
echo "  3. Test: auth login, note loading, storage uploads"
echo "============================================"
