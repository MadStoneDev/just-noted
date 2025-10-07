// Timing Constants
export const DEBOUNCE_DELAY = 2000; // 2 seconds for auto-save
export const REFRESH_INTERVAL = 10000; // 10 seconds for note refresh
export const ACTIVITY_TIMEOUT = 30000; // 30 seconds before considering user inactive
export const INIT_TIMEOUT = 10000; //
export const HAS_INITIALISED_KEY = "justNoted_has_initialised"; //

// Redis Constants
export const MAX_RETRIES = 3;
export const TWO_MONTHS_IN_SECONDS = 2 * 30 * 24 * 60 * 60; // 5,184,000 seconds
export const NOTES_KEY_PREFIX = "notes:";
export const USER_ACTIVITY_PREFIX = "user:activity:";
export const GLOBAL_NOTE_COUNTER_KEY = "global:note:counter";
export const USER_NOTE_COUNT_KEY = "justNoted_user_note_count";

// Backup Constants
export const DB_NAME = "NotesBackupDB";
export const DB_VERSION = 1;
export const STORE_NAME = "backups";
export const MAX_BACKUPS = 50;
export const ENCRYPTION_KEY_NAME = "notes-backup-key";

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

// Other
export const MOBILE_BREAKPOINT = 768;
