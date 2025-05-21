export type NoteSource = "redis" | "supabase";

export interface CombinedNote {
  id: string;
  author?: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  isPrivate?: boolean;
  isPinned?: boolean;
  isCollapsed?: boolean;
  order?: number;
  source: NoteSource;
  goal?: number;
  goal_type?: string;
}
