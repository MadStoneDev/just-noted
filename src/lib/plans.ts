// The single source of truth for JustNoted's plans.
//
// Every plan fact — price, limits, retention, feature flags, and the marketing
// copy — lives here and nowhere else. The pricing page, Settings → Plan & Usage,
// and all server-side enforcement (notebooks, collaborators, version caps, trash
// retention) read from this file. If a plan fact needs to change, it changes
// here once.
//
// Convention: a numeric limit of -1 means "unlimited" (matches the existing
// meter/enforcement code, which treats a value < 0 as no cap).

export type PlanTier = "draft" | "scribe";

export const UNLIMITED = -1 as const;

export interface Plan {
  id: PlanTier;
  label: string;
  price: {
    amount: number; // in whole dollars
    currency: "AUD";
    interval: "month" | null; // null for a free plan
    display: string; // what the UI shows, e.g. "Free" or "A$5/month"
    gstNote: string | null; // shown near the price when relevant
  };
  limits: {
    maxNotes: number; // -1 = unlimited
    maxNotebooks: number; // -1 = unlimited
    maxEditCollaborators: number; // -1 = unlimited, 0 = view-only sharing
    autosaveVersionCap: number; // routine autosave snapshots kept per note
  };
  retention: {
    trashDays: number; // default recoverable window
    trashOptions: readonly number[]; // windows the user may choose ([] = fixed)
  };
  features: {
    editCollaboration: boolean; // add people who can edit (live collaboration)
    versionHistoryRangeFilter: boolean; // date/time range filter in history
    export: boolean;
    templates: boolean;
  };
  // Marketing bullets — only features that exist today.
  highlights: readonly string[];
}

export const PLANS = {
  draft: {
    id: "draft",
    label: "Draft",
    price: {
      amount: 0,
      currency: "AUD",
      interval: null,
      display: "Free",
      gstNote: null,
    },
    limits: {
      maxNotes: UNLIMITED,
      maxNotebooks: 10,
      maxEditCollaborators: 0,
      autosaveVersionCap: 50,
    },
    retention: {
      trashDays: 30,
      trashOptions: [],
    },
    features: {
      editCollaboration: false,
      versionHistoryRangeFilter: false,
      export: true,
      templates: true,
    },
    highlights: [
      "Unlimited notes",
      "10 notebooks (including sections)",
      "Share notes to view",
      "30-day trash recovery",
      "50 versions of history per note",
      "Export and templates",
    ],
  },
  scribe: {
    id: "scribe",
    label: "Scribe",
    price: {
      amount: 5,
      currency: "AUD",
      interval: "month",
      display: "A$5/month",
      gstNote: "No GST is charged — RAVENCI Solutions isn't registered for GST.",
    },
    limits: {
      maxNotes: UNLIMITED,
      maxNotebooks: UNLIMITED,
      maxEditCollaborators: UNLIMITED,
      autosaveVersionCap: 200,
    },
    retention: {
      trashDays: 60,
      trashOptions: [60, 90],
    },
    features: {
      editCollaboration: true,
      versionHistoryRangeFilter: true,
      export: true,
      templates: true,
    },
    highlights: [
      "Everything in Draft",
      "Unlimited notebooks",
      "Live collaboration — share notes others can edit",
      "60 or 90-day trash recovery",
      "200 versions of history per note",
      "Date range filter in version history",
    ],
  },
} as const satisfies Record<PlanTier, Plan>;

export function planFor(tier: PlanTier): Plan {
  return PLANS[tier];
}

/**
 * What changes when a Scribe goes back to Draft, generated from the config so
 * the numbers always match enforcement. Shown before cancelling and in Plan &
 * Usage after. Nothing is deleted — every change is reversible on re-upgrade.
 */
export function downgradeEffects(): string[] {
  const d = PLANS.draft;
  return [
    "Nothing is deleted.",
    `Your notebooks stay — you just can't create new ones past ${d.limits.maxNotebooks}.`,
    "People you shared notes with for editing become view-only (their access returns if you upgrade again).",
    `Version history is kept and trims back toward ${d.limits.autosaveVersionCap} per note over time as you edit.`,
    `Trash keeps a ${d.retention.trashDays}-day window measured from your downgrade date.`,
  ];
}

/** A limit of -1 (or any negative) means unlimited. */
export function isUnlimited(limit: number): boolean {
  return limit < 0;
}

/**
 * How many of the oldest autosave snapshots to delete before inserting a new
 * one, so the total settles at `cap`. Pure so the version-cap enforcement is
 * testable without a database.
 */
export function autosaveTrimCount(existingCount: number, cap: number): number {
  return existingCount >= cap ? existingCount - (cap - 1) : 0;
}

/**
 * Row model for the Draft-vs-Scribe comparison table, generated from the config
 * so the pricing page and Plan & Usage never diverge. Each cell is either a
 * boolean (rendered as a tick/dash) or a string.
 */
export interface ComparisonRow {
  label: string;
  draft: string | boolean;
  scribe: string | boolean;
}

function cap(n: number, unit: string): string {
  return isUnlimited(n) ? "Unlimited" : `${n} ${unit}`;
}

function retentionLabel(plan: Plan): string {
  if (plan.retention.trashOptions.length > 0) {
    return `${plan.retention.trashOptions.join(" or ")} days`;
  }
  return `${plan.retention.trashDays} days`;
}

export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  { label: "Notes", draft: cap(PLANS.draft.limits.maxNotes, "notes"), scribe: cap(PLANS.scribe.limits.maxNotes, "notes") },
  { label: "Notebooks", draft: cap(PLANS.draft.limits.maxNotebooks, "notebooks"), scribe: cap(PLANS.scribe.limits.maxNotebooks, "notebooks") },
  { label: "Share to view", draft: true, scribe: true },
  {
    label: "Share to edit (live collaboration)",
    draft: PLANS.draft.features.editCollaboration,
    scribe: PLANS.scribe.features.editCollaboration,
  },
  {
    label: "Edit collaborators",
    draft: PLANS.draft.limits.maxEditCollaborators === 0 ? "—" : cap(PLANS.draft.limits.maxEditCollaborators, "people"),
    scribe: cap(PLANS.scribe.limits.maxEditCollaborators, "people"),
  },
  { label: "Trash recovery", draft: retentionLabel(PLANS.draft), scribe: retentionLabel(PLANS.scribe) },
  {
    label: "Version history",
    draft: `${PLANS.draft.limits.autosaveVersionCap} per note`,
    scribe: `${PLANS.scribe.limits.autosaveVersionCap} per note`,
  },
  {
    label: "Version history date filter",
    draft: PLANS.draft.features.versionHistoryRangeFilter,
    scribe: PLANS.scribe.features.versionHistoryRangeFilter,
  },
  { label: "Export", draft: PLANS.draft.features.export, scribe: PLANS.scribe.features.export },
  { label: "Templates", draft: PLANS.draft.features.templates, scribe: PLANS.scribe.features.templates },
];
