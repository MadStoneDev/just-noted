"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  IconArrowLeft,
  IconUser,
  IconCalendarEvent,
  IconLoader,
  IconPrinter,
} from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

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

  const [note, setNote] = useState<SharedNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  // Get Supabase client
  const supabase = createClient();

  // Print function
  const handlePrint = () => {
    window.print();
  };

  // Format date to match your style
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Custom components for ReactMarkdown
  const markdownComponents: Components = {
    // Custom list item renderer for checkboxes
    li: ({ children, ...props }) => {
      const text = children?.toString() || "";

      // Check if this is a checkbox item
      if (
        text.startsWith("[ ]") ||
        text.startsWith("[x]") ||
        text.startsWith("[X]")
      ) {
        const isChecked = text.startsWith("[x]") || text.startsWith("[X]");
        const content = text.slice(3).trim(); // Remove the checkbox syntax

        return (
          <li role="checkbox" aria-checked={isChecked}>
            <span>{content}</span>
          </li>
        );
      }

      // Regular list item
      return <li {...props}>{children}</li>;
    },
  };

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

        // Fetch the shared note
        const result = await getNoteByShortcodeAction(shortcode, username);

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

  if (isLoading) {
    return (
      <main className="mt-2 flex-grow w-full overflow-hidden">
        <div className="px-3 col-span-12 flex items-center justify-center min-h-96">
          <div className="flex items-center gap-2 text-neutral-500">
            <IconLoader className="animate-spin" size={24} strokeWidth={1.5} />
            <span className="text-lg">Loading shared note...</span>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mt-2 flex-grow w-full overflow-hidden">
        <section className="px-3 col-span-12 flex items-center justify-between mb-4">
          <Link
            href="/"
            className="px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-primary hover:text-white transition-all duration-300 ease-in-out"
          >
            <IconArrowLeft size={20} strokeWidth={1.5} />
            <span>Back to Home</span>
          </Link>
        </section>

        <div className="px-3 grid grid-cols-12 gap-3">
          <div className="col-span-12 bg-white rounded-xl border border-neutral-300 p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-8 bg-red-500 rounded-full"></div>
              <h1 className="text-2xl font-semibold text-neutral-800">
                Access Error
              </h1>
            </div>
            <p className="text-neutral-600 mb-6">{error}</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 bg-mercedes-primary text-white rounded-lg hover:bg-mercedes-primary/80 transition-all duration-300 ease-in-out"
            >
              <IconArrowLeft size={18} strokeWidth={1.5} />
              Return to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!note) {
    return (
      <main className="mt-2 flex-grow w-full overflow-hidden">
        <section className="px-3 col-span-12 flex items-center justify-between mb-4">
          <Link
            href="/"
            className="px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-primary hover:text-white transition-all duration-300 ease-in-out"
          >
            <IconArrowLeft size={20} strokeWidth={1.5} />
            <span>Back to Home</span>
          </Link>
        </section>

        <div className="px-3 grid grid-cols-12 gap-3">
          <div className="col-span-12 bg-white rounded-xl border border-neutral-300 p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-8 bg-yellow-500 rounded-full"></div>
              <h1 className="text-2xl font-semibold text-neutral-800">
                Note Not Found
              </h1>
            </div>
            <p className="text-neutral-600 mb-6">
              The requested note could not be found.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 bg-mercedes-primary text-white rounded-lg hover:bg-mercedes-primary/80 transition-all duration-300 ease-in-out"
            >
              <IconArrowLeft size={18} strokeWidth={1.5} />
              Return to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mt-2 flex-grow w-full overflow-hidden">
      {/* Add print styles */}
      <style jsx global>{`
        @media print {
          /* Hide navigation and non-essential elements when printing */
          .print-hide {
            display: none !important;
          }

          /* Ensure proper spacing for print */
          .print-content {
            margin: 0 !important;
            padding: 20px !important;
          }

          /* Make sure checkboxes print correctly */
          .mdx-editor-custom li[role="checkbox"]::before {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Ensure headings break properly */
          .mdx-editor-custom h1,
          .mdx-editor-custom h2,
          .mdx-editor-custom h3,
          .mdx-editor-custom h4,
          .mdx-editor-custom h5,
          .mdx-editor-custom h6 {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          /* Keep list items together */
          .mdx-editor-custom li {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Header section with navigation */}
      <section className="px-3 col-span-12 flex items-center justify-between mb-4 print-hide">
        <Link
          href="/"
          className="px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-primary hover:text-white transition-all duration-300 ease-in-out"
        >
          <IconArrowLeft size={20} strokeWidth={1.5} />
          <span className="hidden md:flex">Back to Home</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-primary hover:text-white transition-all duration-300 ease-in-out"
          >
            <IconPrinter size={20} strokeWidth={1.5} />
            <span className="hidden md:flex">Print</span>
          </button>

          {currentUsername ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <IconUser size={16} strokeWidth={1.5} />
              <span>
                Viewing as{" "}
                <span className="font-medium text-neutral-700">
                  {currentUsername}
                </span>
              </span>
            </div>
          ) : (
            <Link
              href="/get-access"
              className="px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-primary hover:text-white transition-all duration-300 ease-in-out"
            >
              Sign in
            </Link>
          )}
        </div>
      </section>

      {/* Note content */}
      <div className="px-3 grid grid-cols-12 gap-3 print-content">
        <div className="col-span-12">
          {/* Note header matching your NoteBlock style */}
          <article className="flex flex-col md:flex-row gap-2 md:items-center mb-4">
            <div className="group flex gap-2 items-center justify-between md:justify-start h-6 font-semibold uppercase">
              <span className="flex items-center gap-1 text-neutral-800">
                {note.title}
              </span>
              <span className="flex items-center gap-1 ml-2 print-hide">
                {note.is_private ? (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 border border-violet-300">
                    PRIVATE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-green-100 text-green-700 border border-green-300">
                    PUBLIC
                  </span>
                )}
              </span>
            </div>

            <div className="flex-grow h-0.5 bg-mercedes-primary transition-all duration-300 ease-in-out"></div>

            {/* Author and date info */}
            <div className="flex items-center gap-4 text-sm text-neutral-500">
              <div className="flex items-center gap-2">
                {note.authorAvatar ? (
                  <img
                    src={note.authorAvatar}
                    alt={note.authorUsername}
                    className="w-5 h-5 rounded-full print-hide"
                  />
                ) : (
                  <div className="w-5 h-5 bg-neutral-300 rounded-full flex items-center justify-center text-xs font-medium text-neutral-600 print-hide">
                    {note.authorUsername.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="font-medium text-neutral-700">
                  {note.authorUsername}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <IconCalendarEvent
                  size={14}
                  strokeWidth={1.5}
                  className="print-hide"
                />
                <span>{formatDate(note.updated_at)}</span>
              </div>
            </div>
          </article>

          {/* Note content area matching your TextBlock styling */}
          <article className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <div className="bg-white rounded-xl border border-neutral-300 p-6">
                <div className="mdx-editor-custom custom-editor-content focus:outline-none">
                  <ReactMarkdown components={markdownComponents}>
                    {note.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </main>
  );
}
