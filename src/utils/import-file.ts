// src/utils/import-file.ts
// Reads dropped or picked plain-text files (.txt / .md) into note-ready content.

export interface ImportedFile {
  title: string;
  content: string;
}

export interface ImportResult {
  imported: ImportedFile[];
  rejected: string[];
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const IMPORTABLE_EXTENSIONS = /\.(md|markdown|mdown|mkd|txt|text)$/i;
const IMPORTABLE_MIME = /^text\/(markdown|x-markdown|plain)$/i;

/** Accept attribute for <input type="file"> and matching mime sniffing. */
export const IMPORT_ACCEPT =
  ".md,.markdown,.mdown,.mkd,.txt,.text,text/markdown,text/plain";

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, "").trim();
}

function isImportable(file: File): boolean {
  if (IMPORTABLE_EXTENSIONS.test(file.name)) return true;
  // Some drops (e.g. from other apps) carry a mime type but a generic name.
  if (file.type && IMPORTABLE_MIME.test(file.type)) return true;
  return false;
}

export async function readImportableFiles(
  files: FileList | File[],
): Promise<ImportResult> {
  const imported: ImportedFile[] = [];
  const rejected: string[] = [];

  for (const file of Array.from(files)) {
    if (!isImportable(file) || file.size > MAX_FILE_SIZE) {
      rejected.push(file.name);
      continue;
    }

    try {
      const content = await file.text();
      imported.push({
        title: stripExtension(file.name) || "Imported note",
        content,
      });
    } catch {
      rejected.push(file.name);
    }
  }

  return { imported, rejected };
}
