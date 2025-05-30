// Export the unified note types and conversion functions
export * from "./combined-notes";

// Legacy Note interface for backward compatibility
export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  goal?: number;
  goal_type?: "words" | "characters" | "";
  pinned?: boolean;
  order?: number;
  isPrivate?: boolean;
  isCollapsed?: boolean;
}
