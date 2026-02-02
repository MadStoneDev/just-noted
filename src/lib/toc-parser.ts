/**
 * Table of Contents Parser
 * Extracts headings from HTML content for navigation
 */

export interface TocHeading {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  position: number;
  children?: TocHeading[];
}

export interface TocTree {
  headings: TocHeading[];
  hasContent: boolean;
}

/**
 * Parse HTML content and extract headings
 */
export function parseHeadings(htmlContent: string): TocHeading[] {
  if (!htmlContent || typeof window === "undefined") {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");
  const headingElements = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");

  const headings: TocHeading[] = [];
  const usedIds = new Set<string>();

  headingElements.forEach((el, index) => {
    const text = el.textContent?.trim() || "";
    if (!text) return; // Skip empty headings

    const level = parseInt(el.tagName[1]) as 1 | 2 | 3 | 4 | 5 | 6;

    // Generate unique ID
    let baseId = generateSlug(text);
    let id = baseId;
    let counter = 1;

    while (usedIds.has(id)) {
      id = `${baseId}-${counter}`;
      counter++;
    }
    usedIds.add(id);

    headings.push({
      id,
      text,
      level,
      position: index,
    });
  });

  return headings;
}

/**
 * Generate a URL-friendly slug from text
 */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .substring(0, 50) // Limit length
    || "heading"; // Fallback
}

/**
 * Build hierarchical tree from flat heading list
 * Groups child headings under their parent based on level
 */
export function buildHeadingTree(headings: TocHeading[]): TocHeading[] {
  if (headings.length === 0) return [];

  const result: TocHeading[] = [];
  const stack: TocHeading[] = [];

  for (const heading of headings) {
    const item: TocHeading = { ...heading, children: [] };

    // Find parent (most recent heading with lower level)
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      result.push(item);
    } else {
      const parent = stack[stack.length - 1];
      if (!parent.children) parent.children = [];
      parent.children.push(item);
    }

    stack.push(item);
  }

  return result;
}

/**
 * Flatten a heading tree back to a flat list (for rendering with indentation)
 */
export function flattenHeadingTree(
  tree: TocHeading[],
  depth: number = 0
): Array<TocHeading & { depth: number }> {
  const result: Array<TocHeading & { depth: number }> = [];

  for (const heading of tree) {
    result.push({ ...heading, depth });
    if (heading.children && heading.children.length > 0) {
      result.push(...flattenHeadingTree(heading.children, depth + 1));
    }
  }

  return result;
}

/**
 * Find heading in editor by matching text content
 * Returns the DOM element if found
 */
export function findHeadingElement(
  container: HTMLElement,
  headingId: string,
  headingText: string,
  headingLevel: number
): HTMLElement | null {
  const selector = `h${headingLevel}`;
  const headings = container.querySelectorAll(selector);

  for (const el of headings) {
    const text = el.textContent?.trim() || "";
    if (text === headingText) {
      return el as HTMLElement;
    }
  }

  // Fallback: try to find by partial match
  for (const el of headings) {
    const text = el.textContent?.trim() || "";
    if (text.includes(headingText) || headingText.includes(text)) {
      return el as HTMLElement;
    }
  }

  return null;
}

/**
 * Get the currently visible heading based on scroll position
 */
export function getActiveHeading(
  container: HTMLElement,
  headings: TocHeading[],
  offset: number = 100
): TocHeading | null {
  if (headings.length === 0) return null;

  const containerRect = container.getBoundingClientRect();
  let activeHeading: TocHeading | null = null;

  for (const heading of headings) {
    const element = findHeadingElement(
      container,
      heading.id,
      heading.text,
      heading.level
    );

    if (element) {
      const rect = element.getBoundingClientRect();
      const relativeTop = rect.top - containerRect.top;

      // If heading is above the offset threshold, it's the active one
      if (relativeTop <= offset) {
        activeHeading = heading;
      } else {
        break;
      }
    }
  }

  // If no heading is above threshold, use first heading
  return activeHeading || headings[0];
}
