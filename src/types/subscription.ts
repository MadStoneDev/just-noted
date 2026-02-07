// Subscription and collaboration types

export type SubscriptionTier = "free" | "pro" | "team";

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
  free: {
    maxNotes: 50,
    maxCollaborators: 0,
    canUseAI: false, // Will be limited
    canExportAll: true,
    canUseTemplates: true,
    maxVersionHistory: 10,
    canCollaborate: false,
  },
  pro: {
    maxNotes: -1, // Unlimited
    maxCollaborators: 5,
    canUseAI: true,
    canExportAll: true,
    canUseTemplates: true,
    maxVersionHistory: 100,
    canCollaborate: true,
  },
  team: {
    maxNotes: -1, // Unlimited
    maxCollaborators: -1, // Unlimited
    canUseAI: true,
    canExportAll: true,
    canUseTemplates: true,
    maxVersionHistory: -1, // Unlimited
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
