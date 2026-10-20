import type { Notebook } from "@/types/notebook";
import type { Tag } from "@/types/tag";

export interface SidebarData {
  notebooks: Notebook[];
  tags: Tag[];
  counts: Record<string, number>;
  looseCount: number;
}

const EMPTY: SidebarData = { notebooks: [], tags: [], counts: {}, looseCount: 0 };

// Client loader for the batched sidebar data — hits /api/sidebar (plain fetch)
// so it runs concurrently instead of queued behind other server actions.
export async function fetchSidebar(): Promise<SidebarData> {
  try {
    const res = await fetch("/api/sidebar", { cache: "no-store" });
    if (!res.ok) return EMPTY;
    const data = await res.json();
    return {
      notebooks: (data?.notebooks as Notebook[]) ?? [],
      tags: (data?.tags as Tag[]) ?? [],
      counts: (data?.counts as Record<string, number>) ?? {},
      looseCount: (data?.looseCount as number) ?? 0,
    };
  } catch {
    return EMPTY;
  }
}
