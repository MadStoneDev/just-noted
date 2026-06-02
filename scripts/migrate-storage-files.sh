#!/bin/bash

# ============================================
# Migrate Supabase Storage files (notebook covers + avatars)
# Downloads from cloud, uploads to self-hosted
# ============================================
#
# USAGE:
#   chmod +x scripts/migrate-storage-files.sh
#   ./scripts/migrate-storage-files.sh

set -e

# ============================================
# CONFIGURATION — FILL THESE IN
# ============================================

# Source (Supabase Cloud)
SOURCE_URL="https://rnbzyxbugmpowkpbtdup.supabase.co"
SOURCE_SERVICE_KEY="your-cloud-service-role-key"

# Destination (Coolify self-hosted)
DEST_URL="https://your-coolify-supabase-url"
DEST_SERVICE_KEY="your-selfhosted-service-role-key"

BUCKETS=("notebook-covers" "avatars")
DOWNLOAD_DIR="./scripts/storage-download"

mkdir -p "$DOWNLOAD_DIR"

for BUCKET in "${BUCKETS[@]}"; do
  echo ""
  echo "📦 Migrating bucket: $BUCKET"

  # Create bucket on destination (ignore if exists)
  curl -s -X POST "$DEST_URL/storage/v1/bucket" \
    -H "Authorization: Bearer $DEST_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"id\": \"$BUCKET\", \"name\": \"$BUCKET\", \"public\": true}" \
    > /dev/null 2>&1 || true
  echo "   ✓ Bucket ensured on destination"

  # List files in source bucket
  FILES=$(curl -s "$SOURCE_URL/storage/v1/object/list/$BUCKET" \
    -H "Authorization: Bearer $SOURCE_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"prefix": "", "limit": 1000}')

  # Parse file paths (simple grep for "name" fields)
  # This handles the flat listing — for nested folders we'd need recursion
  echo "$FILES" | grep -oP '"name"\s*:\s*"\K[^"]+' | while read -r FOLDER; do
    # List files inside each folder
    INNER=$(curl -s "$SOURCE_URL/storage/v1/object/list/$BUCKET" \
      -H "Authorization: Bearer $SOURCE_SERVICE_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"prefix\": \"$FOLDER/\", \"limit\": 1000}")

    echo "$INNER" | grep -oP '"name"\s*:\s*"\K[^"]+' | while read -r FILE; do
      FILEPATH="$FOLDER/$FILE"
      LOCAL_PATH="$DOWNLOAD_DIR/$BUCKET/$FILEPATH"

      mkdir -p "$(dirname "$LOCAL_PATH")"

      echo "   ↓ Downloading $FILEPATH..."
      curl -s -o "$LOCAL_PATH" \
        "$SOURCE_URL/storage/v1/object/$BUCKET/$FILEPATH" \
        -H "Authorization: Bearer $SOURCE_SERVICE_KEY"

      echo "   ↑ Uploading $FILEPATH..."
      curl -s -X POST "$DEST_URL/storage/v1/object/$BUCKET/$FILEPATH" \
        -H "Authorization: Bearer $DEST_SERVICE_KEY" \
        -H "Content-Type: $(file -b --mime-type "$LOCAL_PATH")" \
        --data-binary "@$LOCAL_PATH" \
        > /dev/null

      echo "   ✓ $FILEPATH migrated"
    done
  done
done

echo ""
echo "============================================"
echo "✅ Storage migration complete!"
echo "============================================"
