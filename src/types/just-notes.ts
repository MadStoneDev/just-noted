export type NoteSource = "redis" | "supabase";

export interface JustNote {
  id: string;
  created_at?: number;
  updated_at?: number;
  author?: string;
  title: string;
  content: string;
  is_private: boolean | null;
  is_pinned: boolean | null;
  is_collapsed: boolean | null;
  order?: number | null;
  goal?: number | null;
  goal_type?: string | null;
  source: NoteSource;
}
