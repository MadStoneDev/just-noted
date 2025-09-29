"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  IconArrowLeft,
  IconCalendarEvent,
  IconLoader,
  IconPrinter,
  IconUser,
} from "@tabler/icons-react";

import { sharingOperation } from "@/app/actions/sharing";
import { createClient } from "@/utils/supabase/client";

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
    return date.toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Process markdown content to handle checkboxes and basic formatting
  const processMarkdown = (content: string): string => {
    // Split content into lines for better processing
    const lines = content.split("\n");
    const processedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) {
        // Empty line - add some spacing
        processedLines.push("<br>");
        continue;
      }

      // Convert actual headings (######, #####, ####, ###, ##, #)
      if (line.match(/^###### (.+)$/)) {
        const content = line.replace(/^### (.+)$/, "$1");
        processedLines.push(`<h6>${content}</h6>`);
        continue;
      }

      if (line.match(/^##### (.+)$/)) {
        const content = line.replace(/^### (.+)$/, "$1");
        processedLines.push(`<h5>${content}</h5>`);
        continue;
      }

      if (line.match(/^#### (.+)$/)) {
        const content = line.replace(/^### (.+)$/, "$1");
        processedLines.push(`<h4>${content}</h4>`);
        continue;
      }

      if (line.match(/^### (.+)$/)) {
        const content = line.replace(/^### (.+)$/, "$1");
        processedLines.push(`<h3>${content}</h3>`);
        continue;
      }

      if (line.match(/^## (.+)$/)) {
        const content = line.replace(/^## (.+)$/, "$1");
        processedLines.push(`<h2>${content}</h2>`);
        continue;
      }

      if (line.match(/^# (.+)$/)) {
        const content = line.replace(/^# (.+)$/, "$1");
        processedLines.push(`<h1>${content}</h1>`);
        continue;
      }

      // Convert checkboxes
      if (line.match(/^\*\s*\[\s*\]/)) {
        const content = line.replace(/^\*\s*\[\s*\]\s*/, "");
        processedLines.push(
          `<li role="checkbox" aria-checked="false"><span>${content}</span></li>`,
        );
        continue;
      }

      if (line.match(/^\*\s*\[[xX]\]/)) {
        const content = line.replace(/^\*\s*\[[xX]\]\s*/, "");
        processedLines.push(
          `<li role="checkbox" aria-checked="true"><span>${content}</span></li>`,
        );
        continue;
      }

      // Convert regular list items
      if (line.match(/^\*\s+/)) {
        const content = line.replace(/^\*\s+/, "");
        processedLines.push(`<li>${content}</li>`);
        continue;
      }

      // Convert bold text inline (not as headings)
      let processedLine = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

      // Regular text
      processedLines.push(processedLine);
    }

    // Now group consecutive list items into ul tags
    const finalLines: string[] = [];
    let inList = false;

    for (const line of processedLines) {
      if (line.startsWith("<li")) {
        if (!inList) {
          finalLines.push("<ul>");
          inList = true;
        }
        finalLines.push(line);
      } else {
        if (inList) {
          finalLines.push("</ul>");
          inList = false;
        }
        finalLines.push(line);
      }
    }

    // Close any remaining list
    if (inList) {
      finalLines.push("</ul>");
    }

    return finalLines.join("");
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
        const result = await sharingOperation({
          operation: "getByShortcode",
          shortcode,
          currentUsername: username,
        });

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
      <main className="mt-2 flex-grow w-full overflow-hidden print:hidden">
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
      <main className="mt-2 flex-grow w-full overflow-hidden print:hidden">
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
      {/* Header section with navigation */}
      <section className="px-3 col-span-12 flex items-center justify-between mb-4 print:hidden">
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
        </div>
      </section>

      {/* Note content */}
      <div className={`px-3 print:px-0 grid grid-cols-12 gap-3`}>
        <div className={`col-span-12`}>
          {/* Note header matching your NoteBlock style */}
          <article
            className={`flex flex-col md:flex-row print:flex-col gap-2 md:items-center mb-4`}
          >
            <div className="group flex gap-2 items-center justify-between md:justify-start h-6 font-semibold uppercase">
              <span className="flex items-center gap-1 text-neutral-800 print:text-lg print:font-black">
                {note.title}
              </span>
              <span className="flex items-center gap-1 ml-2 print:hidden">
                {note.is_private ? (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 border border-violet-300">
                    PRIVATE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 border border-blue-300">
                    PUBLIC
                  </span>
                )}
              </span>
            </div>

            <div
              className={`flex-grow h-0.5 ${
                note.is_private ? "bg-violet-700" : "bg-neutral-300"
              } transition-all duration-300 ease-in-out`}
            ></div>

            <div
              className={`hidden print:block w-full h-0.5 border bg-neutral-900`}
            ></div>

            {/* Author and date info */}
            <div className="flex print:flex-col items-center print:items-start gap-4 print:gap-1 text-sm text-neutral-500">
              <div className={`flex items-center gap-2 print:gap-1`}>
                <span className={`hidden print:block font-bold`}>Author: </span>
                {note.authorAvatar ? (
                  <img
                    src={note.authorAvatar}
                    alt={note.authorUsername}
                    className="w-5 h-5 aspect-1 rounded-full print:hidden"
                  />
                ) : (
                  <div className="w-5 h-5 bg-neutral-300 rounded-full flex items-center justify-center text-xs font-medium text-neutral-600 print-hide">
                    {note.authorUsername.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className={`font-medium text-neutral-700`}>
                  {note.authorUsername}
                </span>
              </div>

              <div className={`flex items-center gap-1`}>
                <span className={`hidden print:block font-bold`}>
                  Last updated:{" "}
                </span>
                <IconCalendarEvent size={14} strokeWidth={1.5} />
                <span>{formatDate(note.updated_at)}</span>
              </div>
            </div>
          </article>

          {/* Note content area matching your TextBlock styling */}
          <article className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <div
                className={`bg-white rounded-xl border border-neutral-300 p-6 print:p-0`}
              >
                <div
                  className="mdx-editor-custom custom-editor-content focus:outline-none"
                  dangerouslySetInnerHTML={{
                    __html: processMarkdown(note.content),
                  }}
                />
              </div>
            </div>
          </article>

          <section
            className={`py-2 flex items-center justify-end print:hidden`}
          >
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
                href={`/get-access`}
                className="px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-primary hover:text-white transition-all duration-300 ease-in-out"
              >
                Get Access
              </Link>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
