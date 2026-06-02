#!/usr/bin/env node

/**
 * Storage Migration Script
 *
 * Copies all files from Supabase Cloud storage buckets to a self-hosted
 * Supabase instance. Handles nested folders and preserves file paths.
 *
 * Usage:
 *   OLD_SUPABASE_URL=https://xxx.supabase.co \
 *   OLD_SERVICE_ROLE_KEY=xxx \
 *   NEW_SUPABASE_URL=https://supabase.yourdomain.com \
 *   NEW_SERVICE_ROLE_KEY=xxx \
 *   node scripts/migrate-storage.js
 *
 * Optional:
 *   DRY_RUN=true    — list files without copying
 *   BUCKETS=avatars  — migrate specific bucket(s), comma-separated
 */

const { createClient } = require("@supabase/supabase-js");

const OLD_URL = process.env.OLD_SUPABASE_URL;
const OLD_KEY = process.env.OLD_SERVICE_ROLE_KEY;
const NEW_URL = process.env.NEW_SUPABASE_URL;
const NEW_KEY = process.env.NEW_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "true";
const BUCKETS_FILTER = process.env.BUCKETS
  ? process.env.BUCKETS.split(",").map((b) => b.trim())
  : null;

if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error(
    "Missing required env vars: OLD_SUPABASE_URL, OLD_SERVICE_ROLE_KEY, NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const oldClient = createClient(OLD_URL, OLD_KEY);
const newClient = createClient(NEW_URL, NEW_KEY);

const BUCKETS_TO_MIGRATE = BUCKETS_FILTER || ["notebook-covers", "avatars"];

async function listAllFiles(client, bucket, folder = "") {
  const files = [];
  const { data, error } = await client.storage
    .from(bucket)
    .list(folder, { limit: 1000 });

  if (error) {
    console.error(`  Error listing ${bucket}/${folder}:`, error.message);
    return files;
  }

  for (const item of data || []) {
    const path = folder ? `${folder}/${item.name}` : item.name;

    if (item.id === null || item.metadata === null) {
      // This is a folder — recurse into it
      const nested = await listAllFiles(client, bucket, path);
      files.push(...nested);
    } else {
      files.push(path);
    }
  }

  return files;
}

async function migrateFile(bucket, filePath) {
  // Download from old instance
  const { data: fileData, error: downloadError } = await oldClient.storage
    .from(bucket)
    .download(filePath);

  if (downloadError) {
    console.error(
      `  FAIL download ${bucket}/${filePath}:`,
      downloadError.message,
    );
    return false;
  }

  // Upload to new instance
  const { error: uploadError } = await newClient.storage
    .from(bucket)
    .upload(filePath, fileData, {
      upsert: true,
      contentType: fileData.type || "application/octet-stream",
    });

  if (uploadError) {
    console.error(
      `  FAIL upload ${bucket}/${filePath}:`,
      uploadError.message,
    );
    return false;
  }

  return true;
}

async function migrateBucket(bucket) {
  console.log(`\nMigrating bucket: ${bucket}`);

  const files = await listAllFiles(oldClient, bucket);

  if (files.length === 0) {
    console.log(`  No files found in ${bucket}`);
    return { total: 0, success: 0, failed: 0 };
  }

  console.log(`  Found ${files.length} file(s)`);

  if (DRY_RUN) {
    files.forEach((f) => console.log(`  [DRY RUN] ${bucket}/${f}`));
    return { total: files.length, success: files.length, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const filePath of files) {
    const ok = await migrateFile(bucket, filePath);
    if (ok) {
      success++;
      console.log(`  OK ${bucket}/${filePath}`);
    } else {
      failed++;
    }
  }

  return { total: files.length, success, failed };
}

async function main() {
  console.log("Supabase Storage Migration");
  console.log(`  From: ${OLD_URL}`);
  console.log(`  To:   ${NEW_URL}`);
  if (DRY_RUN) console.log("  MODE: DRY RUN (no files will be copied)");
  console.log(`  Buckets: ${BUCKETS_TO_MIGRATE.join(", ")}`);

  const results = {};

  for (const bucket of BUCKETS_TO_MIGRATE) {
    results[bucket] = await migrateBucket(bucket);
  }

  console.log("\n--- Summary ---");
  for (const [bucket, stats] of Object.entries(results)) {
    console.log(
      `  ${bucket}: ${stats.success}/${stats.total} migrated, ${stats.failed} failed`,
    );
  }

  const totalFailed = Object.values(results).reduce(
    (sum, s) => sum + s.failed,
    0,
  );
  if (totalFailed > 0) {
    console.error(`\n${totalFailed} file(s) failed to migrate.`);
    process.exit(1);
  }

  console.log("\nMigration complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
