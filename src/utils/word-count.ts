export function countWordsInContent(content: string): number {
  const text = (content || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_~`>\-\[\]]/g, " ");
  return text.split(/\s+/).filter(Boolean).length;
}
