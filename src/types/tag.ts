export interface Tag {
  id: string;
  owner: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface TagRow {
  id: string;
  owner: string;
  name: string;
  color: string;
  created_at: string;
}

export function tagRowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    color: row.color,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export const TAG_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#78716c",
] as const;
