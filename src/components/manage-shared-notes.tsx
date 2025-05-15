// components/manage-shared-notes.tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import {
  IconEye,
  IconLink,
  IconTrash,
  IconWorld,
  IconLock,
} from "@tabler/icons-react";
import { deleteSharedNoteAction } from "@/app/actions/shareActions";

interface SharedNote {
  id: string;
  shortcode: string;
  note_id: string;
  is_public: boolean;
  reader_username: string | null;
  created_at: string;
}

export default function ManageSharedNotes() {
  const [sharedNotes, setSharedNotes] = useState<SharedNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSharedNotes = async () => {
    try {
      setIsLoading(true);
      const supabase = createClient();

      // Get the current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("User not authenticated");
        setIsLoading(false);
        return;
      }

      // Load shared notes for this user
      const { data, error: fetchError } = await supabase
        .from("shared_notes")
        .select(
          `
          id, 
          shortcode, 
          note_id, 
          is_public, 
          reader_username, 
          created_at
        `,
        )
        .eq("note_owner_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Error loading shared notes:", fetchError);
        setError("Failed to load shared notes");
        setIsLoading(false);
        return;
      }

      setSharedNotes(data || []);
    } catch (err) {
      console.error("Error in ManageSharedNotes:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSharedNotes();
  }, []);

  const handleUnshare = async (shortcode: string) => {
    if (!confirm("Are you sure you want to unshare this note?")) {
      return;
    }

    try {
      const result = await deleteSharedNoteAction(shortcode);

      if (result.success) {
        // Update the local state
        setSharedNotes((prev) =>
          prev.filter((note) => note.shortcode !== shortcode),
        );
      } else {
        console.error("Failed to unshare note:", result.error);
        alert("Failed to unshare note");
      }
    } catch (err) {
      console.error("Error unsharing note:", err);
      alert("An error occurred while unsharing the note");
    }
  };

  const handleCopyLink = (shortcode: string) => {
    const shareUrl = `${window.location.origin}/${shortcode}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        alert("Link copied to clipboard!");
      })
      .catch((err) => {
        console.error("Failed to copy: ", err);
      });
  };

  if (isLoading) {
    return <div>Loading shared notes...</div>;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  if (sharedNotes.length === 0) {
    return (
      <div className="text-center p-4">
        <p>You haven't shared any notes yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Shared Notes</h2>

      <div className="space-y-3">
        {sharedNotes.map((note) => (
          <div
            key={note.id}
            className="p-4 border rounded-lg flex justify-between items-center"
          >
            <div>
              <div className="font-medium">
                {note.is_public ? (
                  <span className="flex items-center">
                    <IconWorld size={16} className="mr-1 text-green-500" />
                    Public
                  </span>
                ) : (
                  <span className="flex items-center">
                    <IconLock size={16} className="mr-1 text-amber-500" />
                    Shared with {note.reader_username}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-500">
                Shared on {new Date(note.created_at).toLocaleDateString()}
              </div>
              <div className="text-sm font-mono mt-1">
                Code: {note.shortcode}
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleCopyLink(note.shortcode)}
                className="p-1 text-gray-600 hover:text-mercedes-primary"
                title="Copy share link"
              >
                <IconLink size={20} />
              </button>
              <Link
                href={`/${note.shortcode}`}
                target="_blank"
                className="p-1 text-gray-600 hover:text-mercedes-primary"
                title="View shared note"
              >
                <IconEye size={20} />
              </Link>
              <button
                onClick={() => handleUnshare(note.shortcode)}
                className="p-1 text-gray-600 hover:text-red-600"
                title="Unshare note"
              >
                <IconTrash size={20} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
