// Timing Constants
export const DEBOUNCE_DELAY = 2000; // 2 seconds for auto-save
export const REFRESH_INTERVAL = 30000; // 30 seconds for note refresh
export const ACTIVITY_TIMEOUT = 30000; // 30 seconds before considering user inactive
export const INIT_TIMEOUT = 10000; // 10 seconds for initialization timeout
export const AUTH_TIMEOUT = 3000; // 3 seconds auth timeout
export const AUTH_MAX_RETRIES = 1; // Single attempt — auth listener handles recovery
export const INIT_RETRY_DELAYS = [2000, 5000, 10000]; // Exponential backoff for init retries
export const LAST_ACCESS_DEBOUNCE = 300000; // 5 minutes between last-access updates
export const HAS_INITIALISED_KEY = "justNoted_has_initialised"; //

// Redis Constants
export const MAX_RETRIES = 3;
export const TWO_MONTHS_IN_SECONDS = 2 * 30 * 24 * 60 * 60; // 5,184,000 seconds (legacy; no longer used to expire note keys)
export const NOTES_KEY_PREFIX = "notes:";
export const USER_ACTIVITY_PREFIX = "user:activity:";

// Guest (Redis) note retention. Note keys are NO LONGER given a TTL — abandoned
// guest notes are removed only by the cleanup job, and only after this window of
// no activity. PROPOSED: 12 months. Flagged for confirmation + privacy-policy
// update before the cleanup job is enabled in production.
export const GUEST_NOTE_RETENTION_DAYS = 365;
export const GUEST_NOTE_RETENTION_SECONDS = GUEST_NOTE_RETENTION_DAYS * 24 * 60 * 60;
// Master kill-switch for the Redis cleanup job. Default OFF: cleanup never
// deletes unless REDIS_CLEANUP_ENABLED === "true" in the environment.
export const REDIS_CLEANUP_ENABLED = process.env.REDIS_CLEANUP_ENABLED === "true";

// Phase 2 optimistic concurrency. During rollout, saves from old clients arrive
// without a base version. When ON (default), the server accepts these
// "version-less" writes but snapshots the prior server content to history first,
// so nothing is silently overwritten. Flip to "false" once legacy writes stay at
// zero. NOTE: offline-queue replay always forces the legacy path regardless of
// this flag (those ops predate versioning), so no queued edit is ever rejected.
export const LEGACY_VERSIONLESS_WRITES = process.env.LEGACY_VERSIONLESS_WRITES !== "false";
export const GLOBAL_NOTE_COUNTER_KEY = "global:note:counter";
export const USER_NOTE_COUNT_KEY = "justNoted_user_note_count";

// Backup Constants
export const DB_NAME = "NotesBackupDB";
export const DB_VERSION = 1;
export const STORE_NAME = "backups";
export const MAX_BACKUPS = 50;
export const ENCRYPTION_KEY_NAME = "notes-backup-key";

// IDB Cache Constants (separate DB from backups — different purpose/lifecycle)
export const IDB_CACHE_DB_NAME = "NotesCacheDB";
export const IDB_CACHE_DB_VERSION = 1;
export const IDB_CACHE_STORE_NAME = "notes";

// Validation Constants
export const VALID_GOAL_TYPES = ["words", "characters", ""] as const;
export type GoalType = (typeof VALID_GOAL_TYPES)[number];

// Note Defaults
export const DEFAULT_NOTE_TITLE = "Just Noted";
export const DEFAULT_WORD_COUNT_WPM = 225; // Average reading speed

// Status Messages
export const STATUS_MESSAGES = {
  SAVING: "Saving...",
  SAVED: "Saved",
  FAILED: "Failed to save",
  PINNING: "Pinning...",
  PINNED: "Pinned",
  UNPINNING: "Unpinning...",
  UNPINNED: "Unpinned",
  MOVING_UP: "Moving up...",
  MOVED_UP: "Moved up",
  MOVING_DOWN: "Moving down...",
  MOVED_DOWN: "Moved down",
  TRANSFERRING: "Transferring...",
  TRANSFER_COMPLETE: "Transfer complete!",
  DELETING: "Deleting...",
  DELETED: "Deleted",
} as const;

// Page Format Constants
export const PAGE_FORMATS = {
  NOVEL: { name: "novel", wordsPerPage: 250 },
  A4: { name: "a4", wordsPerPage: 500 },
  A5: { name: "a5", wordsPerPage: 300 },
} as const;

// Offline Queue Constants (separate DB from NotesCacheDB)
export const OFFLINE_QUEUE_DB_NAME = "OfflineQueueDB";
export const OFFLINE_QUEUE_DB_VERSION = 1;
export const OFFLINE_QUEUE_STORE_NAME = "operations";
export const MAX_QUEUE_RETRIES = 5; // legacy; edits are no longer dropped at this count
export const QUEUE_RETRY_INTERVAL = 30000; // 30 seconds
// Queued edits are NEVER dropped. On repeated failure they back off
// exponentially between QUEUE_BACKOFF_BASE_MS and QUEUE_BACKOFF_MAX_MS, and once
// a note's op has failed QUEUE_PROBLEM_RETRIES times we raise a "sync problem".
export const QUEUE_BACKOFF_BASE_MS = 5000; // 5s
export const QUEUE_BACKOFF_MAX_MS = 300000; // 5min
export const QUEUE_PROBLEM_RETRIES = 3;

// Other
export const MOBILE_BREAKPOINT = 768;
