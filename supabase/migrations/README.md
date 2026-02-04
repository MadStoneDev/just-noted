# Supabase Migrations

This folder contains SQL migrations for the Just Noted database.

## Applying Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Log into your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the contents of the migration file
4. Paste and run the SQL

### Option 2: Supabase CLI

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## Migration Files

### 20260205_rls_policies_revised.sql

Comprehensive RLS security fix that:

**Removes dangerous policies:**
- `authors`: Removes "Allow insert for new user profiles" and "Allow trigger to insert authors" (allowed anyone to insert)
- `notes`: Removes duplicate policies and "Users can create their own notes" (allowed any authenticated user to insert with any author)

**Enables RLS on unprotected tables:**
- `shared_notes` - Was completely unprotected
- `shared_notes_readers` - Had policies but RLS was disabled

**Adds missing policies:**
- `collections` - Had RLS enabled but no policies (was locked out)
- `collections_notes` - Had RLS enabled but no policies (was locked out)

**Fixes column references:**
- Updates `shared_notes_analytics` and `shared_notes_readers` policies to use `note_owner_id` instead of deprecated `note_owner_id_old`

**Creates subscriptions table:**
- Creates table if not exists with proper RLS
- Only service role can modify (for Paddle webhooks)

## Post-Migration Verification

Run these queries to verify the migration worked:

```sql
-- Check RLS is enabled on all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('authors', 'notes', 'notebooks', 'collections',
  'collections_notes', 'shared_notes', 'shared_notes_readers',
  'shared_notes_analytics', 'subscriptions');

-- Should show rowsecurity = true for all tables

-- Check policies exist
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

## Important Notes

1. **Service Role Key**: Webhook handlers (Paddle) use the service role key to bypass RLS. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in your environment.

2. **Backup First**: Always backup your data before running migrations in production.

3. **Test Thoroughly**: After applying, test all CRUD operations in your app to ensure they work correctly.
