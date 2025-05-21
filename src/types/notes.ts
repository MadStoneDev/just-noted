export interface Note {
  id: string;
  title: string;
  content: string;
  goal?: number;
  goal_type?: "" | "words" | "characters";
  createdAt?: number;
  updatedAt?: number;
  pinned?: boolean;
  order?: number;
  isPrivate?: boolean;
  isCollapsed?: boolean;
}
