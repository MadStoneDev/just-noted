import { Notebook } from "@/types/notebook";

export interface FlatNotebookEntry {
  notebook: Notebook;
  depth: number;
  isCurrent?: boolean;
}

export function getSortedNotebookTree(
  notebooks: Notebook[],
  currentId?: string | null,
): FlatNotebookEntry[] {
  const roots = notebooks
    .filter((nb) => !nb.parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const entries: FlatNotebookEntry[] = [];
  for (const root of roots) {
    entries.push({ notebook: root, depth: 0, isCurrent: root.id === currentId });
    const children = notebooks
      .filter((nb) => nb.parentId === root.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      entries.push({ notebook: child, depth: 1, isCurrent: child.id === currentId });
    }
  }
  return entries;
}
