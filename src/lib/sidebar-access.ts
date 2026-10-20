import { createClient } from "@/utils/supabase/server";
import { Notebook, NotebookRow, notebookRowToNotebook } from "@/types/notebook";
import { Tag, TagRow, tagRowToTag } from "@/types/tag";

export interface SidebarData {
  notebooks: Notebook[];
  tags: Tag[];
  counts: Record<string, number>;
  looseCount: number;
}

const EMPTY: SidebarData = { notebooks: [], tags: [], counts: {}, looseCount: 0 };

// Batches the three sidebar reads (notebooks + tags + per-notebook note counts)
// into ONE round-trip with ONE getUser(), on the cookie/RLS client scoped to
// the user. Replaces getNotebooks() + getTags() (+counts) firing separately.
export async function loadSidebar(): Promise<SidebarData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  const [nbRes, tagRes, notesRes] = await Promise.all([
    supabase
      .from("notebooks")
      .select("*")
      .eq("owner", user.id)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase.from("tags").select("*").order("name", { ascending: true }),
    supabase.from("notes").select("notebook_id").eq("author", user.id),
  ]);

  const notebooks = ((nbRes.data as NotebookRow[]) || []).map(notebookRowToNotebook);
  const tags = ((tagRes.data as TagRow[]) || []).map(tagRowToTag);
  const counts: Record<string, number> = {};
  let looseCount = 0;
  for (const n of (notesRes.data as { notebook_id: string | null }[]) || []) {
    if (n.notebook_id) counts[n.notebook_id] = (counts[n.notebook_id] || 0) + 1;
    else looseCount++;
  }
  return { notebooks, tags, counts, looseCount };
}
