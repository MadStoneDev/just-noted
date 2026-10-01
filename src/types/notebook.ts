export type CoverType = "color" | "gradient" | "photo" | "custom";

// ===== New model (03-notebooks.md). Added alongside the legacy fields during the
// expand/contract window; a later CONTRACT migration drops cover_type/cover_value/
// word_goal/is_hidden/show_hidden_children/display_order. =====

export type NotebookColour =
  | "violet"
  | "violet-light"
  | "blue"
  | "indigo"
  | "pink"
  | "green";

export const NOTEBOOK_COLOURS: NotebookColour[] = [
  "violet",
  "violet-light",
  "blue",
  "indigo",
  "pink",
  "green",
];

/** Normalised crop box (fractions 0–1). Missing crop = centred 4:3 at render. */
export interface CoverCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type NotebookCover =
  | { type: "gradient" }
  | { type: "flat"; mark?: { emoji?: string; initial?: boolean } }
  | { type: "image"; url: string; crop?: CoverCrop };

export type NotebookGoal = { type: "daily" | "total"; target: number } | null;

export interface Notebook {
  id: string;
  owner: string;
  name: string;
  // New model
  colour: NotebookColour;
  cover: NotebookCover;
  description: string | null;
  goal: NotebookGoal;
  isPrivate: boolean;
  isPublished: boolean;
  sortIndex: number;
  parentId?: string | null;
  // Legacy (kept until the CONTRACT migration)
  coverType: CoverType;
  coverValue: string;
  displayOrder: number;
  wordGoal: number;
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
  // New model (optional — the new create sheet will supply these)
  colour?: NotebookColour;
  cover?: NotebookCover;
  description?: string | null;
  goal?: NotebookGoal;
  isPrivate?: boolean;
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
  // New model
  colour?: NotebookColour;
  cover?: NotebookCover;
  description?: string | null;
  goal?: NotebookGoal;
  isPrivate?: boolean;
  isPublished?: boolean;
  sortIndex?: number;
}

// The notebook cap lives in the single plan config: PLANS[tier].limits.maxNotebooks
// (@/lib/plans). Sections count toward it.

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
  // New model
  colour?: string;
  cover?: unknown;
  description?: string | null;
  goal?: unknown;
  is_private?: boolean;
  is_published?: boolean;
  sort_index?: number;
  created_at: string;
  updated_at: string;
}

function parseColour(v: unknown): NotebookColour {
  return typeof v === "string" && (NOTEBOOK_COLOURS as string[]).includes(v)
    ? (v as NotebookColour)
    : "violet";
}

function parseCover(v: unknown): NotebookCover {
  if (v && typeof v === "object" && "type" in (v as Record<string, unknown>)) {
    const o = v as Record<string, unknown>;
    if (o.type === "gradient") return { type: "gradient" };
    if (o.type === "flat") return { type: "flat", mark: o.mark as { emoji?: string; initial?: boolean } | undefined };
    if (o.type === "image" && typeof o.url === "string") {
      return { type: "image", url: o.url, crop: o.crop as CoverCrop | undefined };
    }
  }
  return { type: "gradient" };
}

function parseGoal(v: unknown): NotebookGoal {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ((o.type === "daily" || o.type === "total") && typeof o.target === "number" && o.target > 0) {
      return { type: o.type, target: o.target };
    }
  }
  return null;
}

// Convert database row to Notebook
export function notebookRowToNotebook(row: NotebookRow): Notebook {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    colour: parseColour(row.colour),
    cover: parseCover(row.cover),
    description: row.description ?? null,
    goal: parseGoal(row.goal),
    isPrivate: row.is_private ?? false,
    isPublished: row.is_published ?? false,
    sortIndex: row.sort_index ?? row.display_order ?? 0,
    parentId: row.parent_id || null,
    coverType: row.cover_type as CoverType,
    coverValue: row.cover_value,
    displayOrder: row.display_order,
    wordGoal: row.word_goal || 0,
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
  // New model
  if (notebook.colour !== undefined) row.colour = notebook.colour;
  if (notebook.cover !== undefined) row.cover = notebook.cover;
  if (notebook.description !== undefined) row.description = notebook.description;
  if (notebook.goal !== undefined) row.goal = notebook.goal;
  if (notebook.isPrivate !== undefined) row.is_private = notebook.isPrivate;
  if (notebook.isPublished !== undefined) row.is_published = notebook.isPublished;
  if (notebook.sortIndex !== undefined) row.sort_index = notebook.sortIndex;
  if (notebook.createdAt !== undefined)
    row.created_at = new Date(notebook.createdAt).toISOString();
  if (notebook.updatedAt !== undefined)
    row.updated_at = new Date(notebook.updatedAt).toISOString();

  return row;
}
