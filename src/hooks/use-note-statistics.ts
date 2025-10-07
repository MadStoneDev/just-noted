import { useMemo } from "react";

interface WordCountGoal {
  target: number;
  type: "" | "words" | "characters";
}

interface UseNoteStatisticsReturn {
  wordCount: number;
  charCount: number;
  readingTime: string;
  pageEstimate: string;
  progressPercentage: number;
}

/**
 * Hook to calculate and memoize note statistics
 *
 * @param content - HTML content of the note
 * @param pageFormat - Page format for page estimate calculation (novel, a4, a5)
 * @param goal - Optional word/character count goal
 * @returns Memoized statistics object
 */
export function useNoteStatistics(
  content: string,
  pageFormat: string = "novel",
  goal: WordCountGoal | null = null,
): UseNoteStatisticsReturn {
  return useMemo(() => {
    // Extract plain text from HTML
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";

    // Normalize text for word counting (preserve line breaks, collapse spaces)
    const normalizedText = plainText
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .trim();

    // Calculate word count
    const words = normalizedText
      ? normalizedText.split(/\s+/).filter(Boolean)
      : [];
    const wordCount = words.length;

    // Calculate character count (all characters including whitespace)
    const isEmpty = plainText.replace(/\s/g, "").length === 0;
    const charCount = isEmpty ? 0 : plainText.length;

    // Calculate reading time (225 WPM average)
    const wpm = 225;
    const minutes = Math.ceil(wordCount / wpm);
    const readingTime =
      minutes < 1 ? "< 1 min" : minutes === 1 ? "1 min" : `${minutes} mins`;

    // Calculate page estimate based on format
    const wordsPerPage =
      pageFormat === "novel" ? 250 : pageFormat === "a4" ? 500 : 300; // a5
    const pages = wordCount / wordsPerPage;
    const pageEstimate = pages < 1 ? "1 page" : `${Math.ceil(pages)} pages`;

    // Calculate progress percentage if goal is set
    let progressPercentage = 0;
    if (goal && goal.target > 0 && goal.type !== "") {
      const currentValue = goal.type === "words" ? wordCount : charCount;
      progressPercentage = Math.min(
        100,
        Math.round((currentValue / goal.target) * 100),
      );
    }

    return {
      wordCount,
      charCount,
      readingTime,
      pageEstimate,
      progressPercentage,
    };
  }, [content, pageFormat, goal]);
}
