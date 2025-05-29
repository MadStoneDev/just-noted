export type NoteSource = "redis" | "supabase";

export interface CombinedNote {
  id: string;
  createdAt: number;
  updatedAt: number;
  author?: string;
  title: string;
  content: string;
  isPrivate?: boolean;
  isPinned?: boolean;
  isCollapsed?: boolean;
  order?: number;
  goal?: number;
  goal_type?: string;
  source: NoteSource;
}
