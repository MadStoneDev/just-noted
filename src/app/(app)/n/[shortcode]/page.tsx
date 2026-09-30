import { Metadata } from "next";
import { sharingOperation } from "@/app/actions/sharing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Per-note social metadata for the shared link. The note itself is rendered by
// NoteWrapper (in the (app) layout) — this is a marker page, so the shared note
// opens inside the app shell (rail + sidebar + note) instead of the old
// standalone top-nav layout.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ shortcode: string }>;
}): Promise<Metadata> {
  const { shortcode } = await params;

  try {
    const result = await sharingOperation({
      operation: "getByShortcode",
      shortcode,
      currentUsername: null,
    });

    if (result.success && result.note) {
      const noteTitle = result.note.title || "Shared Note";
      const authorName = result.note.authorUsername || "Unknown";
      const contentPreview = result.note.content
        ? result.note.content
            .replace(/<[^>]*>/g, "")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/\* \[[x ]\]/g, "")
            .trim()
            .substring(0, 150) + (result.note.content.length > 150 ? "..." : "")
        : "A shared note";

      return {
        title: `${noteTitle} - JustNoted`,
        description: `Shared note by ${authorName}: ${contentPreview}`,
        openGraph: {
          title: `${noteTitle} - JustNoted`,
          description: `Shared note by ${authorName}: ${contentPreview}`,
          images: [
            { url: "/JustNoted_OG.jpg", width: 1200, height: 630, alt: `${noteTitle} - JustNoted` },
          ],
          locale: "en_US",
          type: "article",
          siteName: "JustNoted",
          authors: [authorName],
        },
        twitter: {
          card: "summary_large_image",
          title: `${noteTitle} - JustNoted`,
          description: `Shared note by ${authorName}: ${contentPreview}`,
          images: ["/JustNoted_OG.jpg"],
          creator: "@justnoted",
        },
      };
    }
  } catch (error) {
    console.error("Error generating shared-note metadata:", error);
  }

  return {
    title: "Shared Note - JustNoted",
    description: "A shared note on JustNoted - Distraction-Free Note Taking",
    openGraph: {
      title: "Shared Note - JustNoted",
      description: "A shared note on JustNoted - Distraction-Free Note Taking",
      images: [{ url: "/JustNoted_OG.jpg", width: 1200, height: 630, alt: "Shared Note - JustNoted" }],
      locale: "en_US",
      type: "article",
      siteName: "JustNoted",
    },
    twitter: {
      card: "summary_large_image",
      title: "Shared Note - JustNoted",
      description: "A shared note on JustNoted - Distraction-Free Note Taking",
      images: ["/JustNoted_OG.jpg"],
      creator: "@justnoted",
    },
  };
}

// Rendered by NoteWrapper via the URL (it reads /n/<shortcode>). Marker page.
export default function SharedNoteMarker() {
  return null;
}
