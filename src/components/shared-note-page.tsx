"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { createClient } from "@/utils/supabase/client";
import { getNoteByShortcodeAction } from "@/app/actions/shareNoteActions";

// Define types for note and params
interface SharedNote {
  id: string;
  title: string;
  content: string;
  author: string;
  authorUsername: string;
  authorAvatar: string | null;
  created_at: string;
  updated_at: string;
  is_private?: boolean;
  is_pinned?: boolean;
}

interface SharedNotePageProps {
  shortcode?: string;
}

export default function SharedNotePage({
  shortcode: propShortcode,
}: SharedNotePageProps) {
  // We'll use the prop if provided, otherwise fall back to params from the router
  const params = useParams();
  const routerShortcode = params?.shortcode as string;
  const shortcode = propShortcode || routerShortcode;

  console.log("SharedNotePage rendered with shortcode:", shortcode);

  const [note, setNote] = useState<SharedNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  // Get Supabase client
  const supabase = createClient();

  useEffect(() => {
    // Get current user info
    const fetchUserAndNote = async () => {
      let username = null;

      try {
        // Check if user is authenticated
        const { data: userData } = await supabase.auth.getUser();

        if (userData?.user) {
          // Get username from authors table
          const { data: authorData } = await supabase
            .from("authors")
            .select("username")
            .eq("id", userData.user.id)
            .single();

          if (authorData?.username) {
            username = authorData.username;
            setCurrentUsername(username);
          }
        }

        console.log("Fetching shared note with shortcode:", shortcode);

        // Fetch the shared note
        const result = await getNoteByShortcodeAction(shortcode, username);
        console.log("Result from getNoteByShortcodeAction:", result);

        if (result.success && result.note) {
          setNote(result.note as SharedNote);
        } else {
          setError(result.error || "Failed to load note");
        }
      } catch (err) {
        console.error("Error fetching shared note:", err);
        setError("An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    if (shortcode) {
      fetchUserAndNote();
    } else {
      setError("No shortcode provided");
      setIsLoading(false);
    }
  }, [shortcode, supabase]);

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <main className="flex-grow container mx-auto max-w-4xl p-6">
          <div className="h-full flex items-center justify-center">
            <div className="animate-pulse text-gray-500">
              Loading shared note...
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <header className="bg-white shadow-sm py-4">
          <div className="container mx-auto max-w-4xl px-6">
            <Link href="/" className="text-mercedes-primary hover:underline">
              ← Back to Home
            </Link>
          </div>
        </header>

        <main className="flex-grow container mx-auto max-w-4xl p-6">
          <div className="bg-white shadow-md rounded-lg p-8 border-t-4 border-red-500">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Access Error
            </h1>
            <p className="text-gray-700">{error}</p>
            <div className="mt-6">
              <Link href="/" className="text-mercedes-primary hover:underline">
                Return to Home
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <header className="bg-white shadow-sm py-4">
          <div className="container mx-auto max-w-4xl px-6">
            <Link href="/" className="text-mercedes-primary hover:underline">
              ← Back to Home
            </Link>
          </div>
        </header>

        <main className="flex-grow container mx-auto max-w-4xl p-6">
          <div className="bg-white shadow-md rounded-lg p-8 border-t-4 border-yellow-500">
            <h1 className="text-2xl font-bold text-yellow-600 mb-4">
              Note Not Found
            </h1>
            <p className="text-gray-700">
              The requested note could not be found.
            </p>
            <div className="mt-6">
              <Link href="/" className="text-mercedes-primary hover:underline">
                Return to Home
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm py-4">
        <div className="container mx-auto max-w-4xl px-6 flex justify-between items-center">
          <Link href="/" className="text-mercedes-primary hover:underline">
            ← Back to Home
          </Link>

          {currentUsername ? (
            <div className="text-sm text-gray-500">
              Viewing as <span className="font-medium">{currentUsername}</span>
            </div>
          ) : (
            <Link
              href="/get-access"
              className="text-mercedes-primary hover:underline"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="flex-grow container mx-auto max-w-4xl p-6">
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          {/* Note Header */}
          <div className="bg-gray-50 p-6 border-b">
            <h1 className="text-2xl font-bold mb-2">{note.title}</h1>

            <div className="flex items-center text-sm text-gray-500 mb-4">
              <div className="flex items-center mr-4">
                {note.authorAvatar ? (
                  <img
                    src={note.authorAvatar}
                    alt={note.authorUsername}
                    className="w-5 h-5 rounded-full mr-2"
                  />
                ) : (
                  <div className="w-5 h-5 bg-gray-200 rounded-full mr-2 flex items-center justify-center text-xs">
                    {note.authorUsername.charAt(0).toUpperCase()}
                  </div>
                )}
                <span>{note.authorUsername}</span>
              </div>

              <div>Last updated {formatDate(note.updated_at)}</div>
            </div>
          </div>

          {/* Note Content */}
          <div className="p-6">
            <div
              className="prose max-w-none"
              dangerouslySetInnerHTML={{ __html: note.content }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
