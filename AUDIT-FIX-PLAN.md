# JustNoted Bug Fix Implementation Plan

## Context
Full codebase audit revealed 56 issues (5 critical, 12 high, 25 medium, 14 low). This plan addresses them in priority order. The critical issues cause: infinite loading spinners, user data loss on save, offline changes being permanently lost, and a security gap in anonymous user ID handling.

## Implementation Order

Changes are grouped into batches. Within each batch, numbered items must be done sequentially (dependencies). Items in different batches are independent.

---

## BATCH 1: CRITICAL FIXES

### 1. Fix initialization retry + auth timeout
**Files:** `src/hooks/use-notes-sync.ts`, `src/constants/app.ts`

**Problem (C2):** `hasInitialisedRef.current = true` at line 134 is set BEFORE async init runs. If init fails, the effect never retries. **Problem (C1):** `supabase.auth.getUser()` at line 147 has no timeout — hangs forever if Supabase is slow.

**Fix:**
- Add `isInitializingRef` to prevent concurrent runs (replaces early `hasInitialisedRef = true`)
- Move `hasInitialisedRef.current = true` into the try block after successful init
- Set `isInitializingRef.current = false` in catch to allow retry
- Wrap `supabase.auth.getUser()` in `Promise.race` with a 5-second timeout
- On auth timeout, proceed as unauthenticated (load Redis notes only)
- Add `AUTH_TIMEOUT = 5000` constant to `src/constants/app.ts`

### 2. Fix auto-save data loss
**File:** `src/hooks/use-auto-save.tsx`

**Problem (C3):** When `saveInProgressRef.current` is true, the debounced save drops content silently (line 31-36). **Problem (C4):** `flushSave` also skips if save in progress (line 60-63). Unmount cleanup (line 84-91) clears timeout but never calls `flushSave`.

**Fix — rewrite the hook:**
- Add `pendingRetryRef` — when save is in progress, mark for retry instead of dropping
- Add `savePromiseRef` — tracks current in-flight save promise
- In `executeSave`, after completing a save, check `pendingRetryRef` and retry if content changed
- In `flushSave`, if save is in progress, `await savePromiseRef.current` first, then save latest
- On unmount, call `flushSave()` in cleanup. Add `beforeunload` event listener as backup
- **Key invariant:** `latestContentRef.current` always has the newest content; it's never silently dropped

### 3. Implement offline queue processing
**File:** `src/hooks/use-online-status.ts`

**Problem (C5/F1):** `useOfflineQueue` stores operations in localStorage but has zero processing logic. Offline edits are permanently lost.

**Fix:**
- Add `useRef` import and `prevOnlineRef` to track online/offline transitions
- Add `useEffect` that watches `isOnline` — when transitioning from offline to online, call `processQueue()`
- Implement `processQueue()`: sort by timestamp, execute each via `noteOperation()`, remove successful ops
- Failed operations stay in queue for next retry
- Expose `processQueue` in return value for manual retry

### 4. Validate Redis userId server-side
**File:** `src/app/actions/notes.ts`

**Problem (C6):** The `userId` for Redis operations comes from client localStorage. No server-side validation beyond checking non-empty. Anyone who learns a UUID can read/write another user's notes.

**Fix (pragmatic approach):**
- Import `isValidUUID` from `src/utils/validation.ts` (already exists)
- Create `validateRedisUserId()` helper that checks both non-empty AND valid UUID format
- Replace all `validateUserId(userId)` calls in `handleRedisOperation` with `validateRedisUserId(userId)`
- This prevents key injection and reduces attack surface to UUID guessing (2^122 entropy = infeasible)
- **Note:** Full HTTP-only cookie approach deferred — requires addressing the middleware redirect to `/login` (which has no matching page) and migration strategy for existing localStorage users

**Additional finding:** The Supabase middleware (`src/utils/supabase/middleware.ts:42-51`) redirects unauthenticated users to `/login`, but no `/login` page exists. This likely works because Supabase anonymous sessions make `user` always truthy. Worth auditing separately but doesn't block this fix.

---

## BATCH 2: HIGH FIXES

### 5. Fix Paddle webhook tier + verification
**File:** `src/app/api/webhooks/paddle/route.ts`

- **H4:** Replace hardcoded `const tier: SubscriptionTier = "pro"` (line 65) with `getTierFromPriceId(event.data.items?.[0]?.price?.id)` using the existing but unused function
- **H5:** Remove `process.env.NODE_ENV === "production"` check (line 41) — always verify signatures when `webhookSecret` is available

### 6. Create shared DOMPurify sanitization utility
**New file:** `src/utils/sanitize.ts`
**Files to modify:** `shared-note-page.tsx`, `version-history.tsx`, `split-view-note-block.tsx`, `reference-note-pane.tsx`, `backup-manager.tsx`

- **H6:** Create `sanitizeHtml()` with restrictive ALLOWED_TAGS and ALLOWED_ATTR config
- Replace all bare `DOMPurify.sanitize(content)` calls across 5+ files

### 7. Delete dead code
**File to delete:** `src/hooks/use-combined-notes.tsx`

- **H7:** Confirmed zero source imports (only in docs). Delete the 1063-line file.

### 8. Add save error indicator
**Files:** `src/stores/notes-store.ts`, `src/components/ui/save-indicator.tsx`, `src/hooks/use-notes-operations.tsx`

- **H8:** Add `saveError: Map<string, boolean>` + `setSaveError` action to Zustand store
- Display "Save failed" with red icon in `save-indicator.tsx` when `saveError.has(noteId)`
- Set error state in `saveNoteContent` catch block, clear on success

### 9. Memoize getFilteredNotes
**Files:** `src/stores/notes-store.ts`, `src/components/just-notes.tsx`

- **H3:** Add module-level memoization cache for `useFilteredNotes` selector
- Only recompute when `notes`, `searchQuery`, `filterSource`, `filterPinned`, or `activeNotebookId` actually change
- Return cached array reference when inputs haven't changed (prevents re-renders)

### 10. Two-phase Supabase loading (metadata-first)
**Files:** `src/app/actions/supabaseActions.ts`, `src/hooks/use-notes-sync.ts`

- **H1:** Add `getNoteMetadataByUserId()` — selects everything except `content`
- Add `getNoteContentsByUserId()` — selects only `id, content`
- Phase 1: Load metadata only (fast, ~5KB), render note list immediately
- Phase 2: Backfill content in background after initial render, merge into store
- Redis notes unaffected (single JSON blob, always full content)

### 11. Add client-side notes cache
**New file:** `src/utils/notes-cache.ts`
**File to modify:** `src/hooks/use-notes-sync.ts`

- **H2:** Create `getCachedNotes()`, `setCachedNotes()`, `clearNotesCache()` utilities
- On init, check cache first — if valid (< 24h old), render immediately, set `isLoading = false`
- Fresh data loads in background and replaces cache
- Clear cache on logout

### 12. Throttle updateLastAccess to user activity only
**Files:** `src/hooks/use-notes-sync.ts`, `src/constants/app.ts`

- **H10:** Remove `updateLastAccess()` from the 60s interval timer
- Add `mousemove`, `keydown`, `click` event listeners with 5-minute throttle
- Add `LAST_ACCESS_DEBOUNCE = 300000` constant

### 13. Replace alert() with toast notifications
**Files:** `src/hooks/use-notes-operations.tsx`, `src/components/note-block/index.tsx`, `src/components/tip-tap-editor.tsx`, `src/components/notebook-export-button.tsx`

- **H11:** Replace all `alert()` calls with the existing toast system
- For hooks: use `useNotesStore` to set a toast state, or accept a toast callback parameter
- For components: use the existing toast component directly

### 14. Consolidate duplicate server actions
**Files:** `src/app/actions/supabaseActions.ts`, `src/app/actions/notes.ts`, all callers

- **H12:** Route all Supabase calls through `noteOperation("supabase", ...)` in `notes.ts`
- Update all imports in `use-notes-operations.tsx`, `use-notes-sync.ts`, etc.
- Delete `supabaseActions.ts` (keep `getNoteMetadataByUserId` and `getNoteContentsByUserId` from step 10 — move them to `notes.ts`)
- **Do this last** in the HIGH batch since it touches many files

### 15. Redis read-all-modify-one-write-all (DEFERRED)
- **H9:** This is architectural. Current Upstash REST API stores all notes as one JSON key. Proper fix is Redis hashes (`HSET notes:{userId} {noteId} {json}`). **Defer to self-hosted migration** — add code comment documenting the limitation.

---

## BATCH 3: MEDIUM FIXES

Quick wins first, then grouped by category:

**Security quick wins:**
- **D7:** Wrap `JSON.parse(localStorage.getItem("splitPaneSizes"))` in try/catch in `notes-store.ts:180`
- **D5:** Tighten TipTap URL validation — explicitly block `data:` and `javascript:` protocols
- **D8:** Increase reCAPTCHA threshold from 0.5 to 0.7 in `contactActions.ts`

**Race condition fixes:**
- **C4 (addNote race):** Use a ref to track/cancel previous `setNewNoteId(null)` timeout
- **C5 (transfer lock):** Add 30-second fallback timeout to release transfer lock
- **C6 (delete error):** Add error recovery in the 10-second delete timeout callback
- **C8 (stale closure):** Use `useRef` for onChange callback in `lazy-text-block.tsx`

**Performance fixes:**
- **B4:** Debounce search input 300ms in sidebar
- **B6:** Add `getById` operation for Redis and Supabase (avoid fetching all notes)
- **B8:** Replace DOM creation with regex-based word count in `use-note-statistics.ts`
- **B12:** Auto-collapse notes when >3 are expanded to limit TipTap instances
- **B5:** Create Supabase RPC for batch order update
- **B9:** Memoize sidebar notebook count fingerprint
- **A6:** Memoize `createClient()` call in `use-notes-sync.ts` with `useMemo`

**Code consolidation:**
- **E3:** Ensure all sorting goes through `sortNotes()` in `notes-utils.ts`
- **E4:** Extract HTML-to-text stripping to shared `src/utils/html-utils.ts`
- **E5:** Merge `contactActions.ts` into `emailActions.ts`

**Feature completeness:**
- **F2:** Implement notebook subscription tier limit check
- **F4/F5:** Add optimistic update rollback on API failure for notebook reorder + bulk actions
- **F6:** Move `new Date()` in note templates from module load to template selection time

**Code quality:**
- **G2:** Type `notesOperations` prop properly instead of `any`
- **G6:** Add null/undefined checks in `redisToCombi`, `supabaseToCombi`
- **E7:** Either implement real image upload or remove the placeholder feature

---

## Verification Plan

After each batch:
1. `npm run build` — verify no compile errors
2. `npx tsc --noEmit` — verify no type errors
3. Manual smoke tests:
   - Create note (local + cloud)
   - Edit note, verify auto-save works
   - Pin/unpin, collapse/expand
   - Search and filter
   - Transfer note between local/cloud
   - Delete note + undo
   - Refresh page, verify notes persist
   - Go offline, make edits, come back online (after C5)
4. Check browser DevTools Network tab — verify fewer/faster API calls after H1/H2/H10
5. Check browser DevTools Performance tab — verify fewer re-renders after H3

---

## Files Modified Summary

| File | Fixes |
|------|-------|
| `src/hooks/use-notes-sync.ts` | C1, C2, H1, H2, H10, A6 |
| `src/hooks/use-auto-save.tsx` | C3, C4 |
| `src/hooks/use-online-status.ts` | C5 |
| `src/app/actions/notes.ts` | C6, H12, H9(comment) |
| `src/constants/app.ts` | C1, H10 |
| `src/app/api/webhooks/paddle/route.ts` | H4, H5 |
| `src/utils/sanitize.ts` (NEW) | H6 |
| `src/utils/notes-cache.ts` (NEW) | H2 |
| `src/stores/notes-store.ts` | H3, H8, D7 |
| `src/components/ui/save-indicator.tsx` | H8 |
| `src/hooks/use-notes-operations.tsx` | H8, H11 |
| `src/app/actions/supabaseActions.ts` | H1, H12(delete) |
| `src/hooks/use-combined-notes.tsx` | H7(delete) |
| 5+ component files | H6, H11 |
| Various medium-priority files | Batch 3 |
