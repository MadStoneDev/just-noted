import { Metadata } from "next";
import Link from "next/link";

import SharedNote from "@/components/shared-note";
import { createClient } from "@/utils/supabase/client";

export async function generateMetadata({
  params,
}: {
  params: { shortcode: string };
}): Promise<Metadata> {
  const supabase = createClient();

  const { data: sharedNote } = await supabase
    .from("shared_notes")
    .select("note_id, storage, is_public, reader_username, expires_at")
    .eq("shortcode", params.shortcode)
    .single();

  if (!sharedNote) {
    return {
      title: "Note not found",
      description:
        "The shared note you're looking for doesn't exist or has expired.",
    };
  }

  return {
    title: "Shared Note | JustNoted",
    description: "View a note shared with you.",
  };
}

export default async function SharedNotePage({
  params,
}: {
  params: { shortcode: string };
}) {
  const supabase = createClient();

  // Get the user if they're authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get the current user's username if authenticated
  let currentUsername = null;
  if (user) {
    const { data: authorData } = await supabase
      .from("authors")
      .select("username")
      .eq("id", user.id)
      .single();

    if (authorData) {
      currentUsername = authorData.username;
    }
  }

  // Get the shared note
  const { data: sharedNote, error } = await supabase
    .from("shared_notes")
    .select(
      "note_id, storage, note_owner_id, is_public, reader_username, expires_at",
    )
    .eq("shortcode", params.shortcode)
    .single();

  // Handle not found or expired notes
  if (!sharedNote || error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-2xl font-bold mb-4">Note Not Found</h1>
          <p className="mb-4">
            The shared note you're looking for doesn't exist or has expired.
          </p>
          <Link
            href="/"
            className="px-4 py-2 bg-mercedes-primary text-white rounded-md inline-block"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  // Check if the note has expired
  if (sharedNote.expires_at && new Date(sharedNote.expires_at) < new Date()) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-2xl font-bold mb-4">Shared Note Expired</h1>
          <p className="mb-4">
            This shared note has expired and is no longer available.
          </p>
          <Link
            href="/"
            className="px-4 py-2 bg-mercedes-primary text-white rounded-md inline-block"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  // Check access permissions
  if (!sharedNote.is_public) {
    // Private note - check if current user is the intended recipient
    if (!currentUsername || currentUsername !== sharedNote.reader_username) {
      return (
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-md">
            <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
            <p className="mb-4">
              This note has been shared privately and is not available to you.
            </p>
            {!user && (
              <p className="mb-4">
                If this note was shared with you, please log in to view it.
              </p>
            )}
            <div className="flex space-x-4">
              <Link
                href="/"
                className="px-4 py-2 bg-mercedes-primary text-white rounded-md inline-block"
              >
                Go Home
              </Link>
              {!user && (
                <Link
                  href="/get-access"
                  className="px-4 py-2 border border-mercedes-primary text-mercedes-primary rounded-md inline-block"
                >
                  Log In
                </Link>
              )}
            </div>
          </div>
        </div>
      );
    }
  }

  // Get the note based on the storage type
  let note;
  if (sharedNote.storage === "supabase") {
    // Get from Supabase
    const { data: noteData } = await supabase
      .from("notes")
      .select("*")
      .eq("id", sharedNote.note_id)
      .eq("user_id", sharedNote.note_owner_id)
      .single();

    if (noteData) {
      note = {
        id: noteData.id,
        title: noteData.title,
        content: noteData.content,
        createdAt: new Date(noteData.created_at).getTime(),
        updatedAt: new Date(noteData.updated_at).getTime(),
        pinned: noteData.is_pinned,
        isPrivate: noteData.is_private,
        isCollapsed: false,
      };
    }
  } else {
    // Get from Redis
    const { getNotesByUserIdAction } = await import(
      "@/app/actions/noteActions"
    );
    const redisResult = await getNotesByUserIdAction(sharedNote.note_owner_id);

    if (redisResult.success && redisResult.notes) {
      note = redisResult.notes.find((n) => n.id === sharedNote.note_id);
    }
  }

  if (!note) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-2xl font-bold mb-4">Note Not Found</h1>
          <p className="mb-4">
            The shared note content could not be retrieved.
          </p>
          <Link
            href="/"
            className="px-4 py-2 bg-mercedes-primary text-white rounded-md inline-block"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const { data: sharedDetails } = await supabase
    .from("shared_notes")
    .select("view_count, note_owner_id")
    .eq("shortcode", params.shortcode)
    .single();

  // Get the owner's username
  const { data: ownerData } = await supabase
    .from("authors")
    .select("username")
    .eq("id", sharedNote.note_owner_id)
    .single();

  const ownerUsername = ownerData?.username || "Anonymous";
  const viewCount = sharedDetails?.view_count || 0;

  return (
    <div className="container mx-auto px-4 py-8 pt-24">
      <SharedNote
        note={note}
        ownerUsername={ownerUsername}
        shortcode={params.shortcode}
        viewCount={viewCount}
      />
    </div>
  );
}
