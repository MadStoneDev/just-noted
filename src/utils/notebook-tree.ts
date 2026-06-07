import { Notebook } from "@/types/notebook";

export interface FlatNotebookEntry {
  notebook: Notebook;
  depth: number;
}

export function getSortedNotebookTree(
  notebooks: Notebook[],
  excludeId?: string | null,
): FlatNotebookEntry[] {
  const roots = notebooks
    .filter((nb) => !nb.parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const entries: FlatNotebookEntry[] = [];
  for (const root of roots) {
    if (root.id === excludeId) continue;
    entries.push({ notebook: root, depth: 0 });
    const children = notebooks
      .filter((nb) => nb.parentId === root.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (child.id === excludeId) continue;
      entries.push({ notebook: child, depth: 1 });
    }
  }
  return entries;
}
