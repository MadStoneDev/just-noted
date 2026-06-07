export type CoverType = "color" | "gradient" | "photo" | "custom";

export interface Notebook {
  id: string;
  owner: string;
  name: string;
  coverType: CoverType;
  coverValue: string;
  displayOrder: number;
  wordGoal: number;
  parentId?: string | null;
  isHidden: boolean;
  showHiddenChildren: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateNotebookInput {
  name: string;
  coverType?: CoverType;
  coverValue?: string;
  parentId?: string | null;
}

export interface UpdateNotebookInput {
  name?: string;
  coverType?: CoverType;
  coverValue?: string;
  displayOrder?: number;
  wordGoal?: number;
  parentId?: string | null;
  isHidden?: boolean;
  showHiddenChildren?: boolean;
}

// Notebook limit for paywall
export const NOTEBOOK_LIMITS = {
  free: 10, // Free tier: 10 notebooks max
  premium: 50, // Premium tier: 50 notebooks
} as const;

export type NotebookTier = keyof typeof NOTEBOOK_LIMITS;

// Database row type (snake_case from Supabase)
export interface NotebookRow {
  id: string;
  owner: string;
  name: string;
  cover_type: string;
  cover_value: string;
  display_order: number;
  word_goal: number;
  parent_id?: string | null;
  is_hidden?: boolean;
  show_hidden_children?: boolean;
  created_at: string;
  updated_at: string;
}

// Convert database row to Notebook
export function notebookRowToNotebook(row: NotebookRow): Notebook {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    coverType: row.cover_type as CoverType,
    coverValue: row.cover_value,
    displayOrder: row.display_order,
    wordGoal: row.word_goal || 0,
    parentId: row.parent_id || null,
    isHidden: row.is_hidden ?? false,
    showHiddenChildren: row.show_hidden_children ?? false,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

// Convert Notebook to database format
export function notebookToRow(
  notebook: Partial<Notebook>,
): Partial<NotebookRow> {
  const row: Partial<NotebookRow> = {};

  if (notebook.id !== undefined) row.id = notebook.id;
  if (notebook.owner !== undefined) row.owner = notebook.owner;
  if (notebook.name !== undefined) row.name = notebook.name;
  if (notebook.coverType !== undefined) row.cover_type = notebook.coverType;
  if (notebook.coverValue !== undefined) row.cover_value = notebook.coverValue;
  if (notebook.displayOrder !== undefined)
    row.display_order = notebook.displayOrder;
  if (notebook.wordGoal !== undefined) row.word_goal = notebook.wordGoal;
  if (notebook.parentId !== undefined) row.parent_id = notebook.parentId;
  if (notebook.isHidden !== undefined) row.is_hidden = notebook.isHidden;
  if (notebook.showHiddenChildren !== undefined) row.show_hidden_children = notebook.showHiddenChildren;
  if (notebook.createdAt !== undefined)
    row.created_at = new Date(notebook.createdAt).toISOString();
  if (notebook.updatedAt !== undefined)
    row.updated_at = new Date(notebook.updatedAt).toISOString();

  return row;
}
