// Subscription and collaboration types

// JustNoted is for individuals writing & sharing — not business teams.
// Two tiers: "draft" (free) → "scribe" (paid).
export type SubscriptionTier = "draft" | "scribe";

export interface Subscription {
  userId: string;
  tier: SubscriptionTier;
  status: "active" | "cancelled" | "past_due" | "trialing";
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  createdAt: number;
  updatedAt: number;
}

// Plan limits, as consumed by getLimits(). The values live in the single plan
// config (@/lib/plans); this is only the shape the resolver returns.
export interface SubscriptionLimits {
  maxNotes: number;
  maxCollaborators: number;
  canExportAll: boolean;
  canUseTemplates: boolean;
  maxVersionHistory: number;
  canCollaborate: boolean;
}

// Collaboration types
export type CollaboratorRole = "viewer" | "editor" | "owner";

export interface NoteCollaborator {
  noteId: string;
  odId: string;
  email: string;
  displayName?: string;
  role: CollaboratorRole;
  addedAt: number;
  addedBy: string;
}

export interface NoteShareSettings {
  noteId: string;
  isPublic: boolean;
  publicLinkId?: string; // For public sharing via link
  allowComments: boolean;
  collaborators: NoteCollaborator[];
}

// Presence types for real-time collaboration
export interface UserPresence {
  odId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  noteId: string;
  cursorPosition?: number;
  lastActiveAt: number;
  isEditing: boolean;
}
