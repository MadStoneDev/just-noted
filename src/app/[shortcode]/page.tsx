import { Suspense } from "react";
import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { getNoteByShortcodeAction } from "@/app/actions/shareNoteActions";
import GlobalHeader from "@/components/global-header";
import GlobalFooter from "@/components/global-footer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Generate dynamic metadata
export async function generateMetadata({
  params,
}: {
  params: Promise<{ shortcode: string }>;
}): Promise<Metadata> {
  const { shortcode } = await params;

  try {
    // Fetch the note to get its title
    const result = await getNoteByShortcodeAction(shortcode, null);

    if (result.success && result.note) {
      const noteTitle = result.note.title || "Shared Note";
      const authorName = result.note.authorUsername || "Unknown";

      // Create a preview of the content (first 150 characters, no HTML)
      const contentPreview = result.note.content
        ? result.note.content
            .replace(/<[^>]*>/g, "") // Remove HTML tags
            .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove markdown bold
            .replace(/\* \[[x ]\]/g, "") // Remove checkbox syntax
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
            {
              url: "/JustNoted_OG.jpg",
              width: 1200,
              height: 630,
              alt: `${noteTitle} - JustNoted`,
            },
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
    console.error("Error generating metadata:", error);
  }

  // Fallback metadata if note not found or error
  return {
    title: "Shared Note - JustNoted",
    description: "A shared note on JustNoted - Distraction-Free Note Taking",
    openGraph: {
      title: "Shared Note - JustNoted",
      description: "A shared note on JustNoted - Distraction-Free Note Taking",
      images: [
        {
          url: "/JustNoted_OG.jpg",
          width: 1200,
          height: 630,
          alt: "Shared Note - JustNoted",
        },
      ],
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

export default async function SharedNotePageWrapper({
  params,
}: {
  params: Promise<{ shortcode: string }>;
}) {
  const { shortcode } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Dynamic import to avoid server component issues
  const SharedNotePage = (await import("@/components/shared-note-page"))
    .default;

  return (
    <>
      <GlobalHeader user={user} />
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center print:hidden">
            <div className="text-neutral-500 animate-pulse">
              Loading shared note...
            </div>
          </div>
        }
      >
        <SharedNotePage />
      </Suspense>
      <GlobalFooter />
    </>
  );
}
