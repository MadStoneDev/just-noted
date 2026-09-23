// Subscription and collaboration types

// JustNoted is for individuals writing & sharing — not business teams.
// Two tiers: "draft" (free) → "scribe" (paid).
export type SubscriptionTier = "draft" | "scribe";

export interface Subscription {
  userId: string;
  tier: SubscriptionTier;
  status: "active" | "cancelled" | "past_due" | "trialing";
  paddleSubscriptionId?: string;
  paddleCustomerId?: string;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SubscriptionLimits {
  maxNotes: number;
  maxCollaborators: number;
  canUseAI: boolean;
  canExportAll: boolean;
  canUseTemplates: boolean;
  maxVersionHistory: number;
  canCollaborate: boolean;
}

export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, SubscriptionLimits> = {
  draft: {
    maxNotes: -1, // Note-taking stays free & generous
    maxCollaborators: 0,
    canUseAI: false, // limited/taste only
    canExportAll: true,
    canUseTemplates: true,
    maxVersionHistory: 10,
    canCollaborate: false,
  },
  scribe: {
    maxNotes: -1,
    maxCollaborators: -1, // unlimited — individuals sharing, no team cap
    canUseAI: true,
    canExportAll: true,
    canUseTemplates: true,
    maxVersionHistory: 100,
    canCollaborate: true,
  },
};

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

// Paddle webhook event types
export interface PaddleWebhookEvent {
  event_type: string;
  event_time: string;
  data: {
    subscription_id?: string;
    customer_id?: string;
    status?: string;
    billing_period?: {
      ends_at: string;
    };
    custom_data?: {
      userId?: string;
    };
    items?: Array<{
      price?: {
        id?: string;
      };
    }>;
  };
}
