import { stripEmptyLineMarkers } from "@/utils/empty-line-marker";

export function countWordsInContent(content: string): number {
  const text = stripEmptyLineMarkers(content || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_~`>\-\[\]]/g, " ");
  return text.split(/\s+/).filter(Boolean).length;
}
