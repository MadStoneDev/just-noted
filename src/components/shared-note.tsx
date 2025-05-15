"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";

import { Note } from "@/types/notes";
import TextBlock from "@/components/text-block";
import { incrementSharedNoteViewCount } from "@/app/actions/shareActions";

interface SharedNoteProps {
  note: Note;
  ownerUsername: string;
  shortcode: string;
  viewCount?: number;
}

export default function SharedNote({
  note,
  ownerUsername,
  shortcode,
  viewCount = 0,
}: SharedNoteProps) {
  const [wordCount, setWordCount] = React.useState(0);
  const [charCount, setCharCount] = React.useState(0);
  const [copied, setCopied] = useState(false);
  const [localViewCount, setLocalViewCount] = useState(viewCount);

  // Calculate stats when component mounts
  React.useEffect(() => {
    // Create a temporary DOM element to parse HTML safely
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = note.content;

    // Get text content which removes all HTML tags
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    const contentWithoutWhitespace = plainText.replace(/\s/g, "");
    const normalizedText = plainText.replace(/\s+/g, " ").trim();
    const words = normalizedText
      ? normalizedText.split(/\s+/).filter(Boolean)
      : [];

    setWordCount(words.length);
    const isEmpty = contentWithoutWhitespace.length === 0;
    setCharCount(isEmpty ? 0 : plainText.length);
  }, [note.content]);

  // Format date with a check for undefined values
  const formatDate = (timestamp?: number) => {
    if (!timestamp) {
      return "Unknown date";
    }
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Get the full share URL using the shortcode
  const getShareUrl = () => {
    if (typeof window === "undefined") return `/${shortcode}`;
    return `${window.location.origin}/${shortcode}`;
  };

  // Handle copy button click
  const handleCopyLink = () => {
    const shareUrl = getShareUrl();
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    const trackView = async () => {
      const result = await incrementSharedNoteViewCount(shortcode);
      if (result) {
        setLocalViewCount((prev) => prev + 1);
      }
    };

    trackView();
  }, [shortcode]);

  // Format creation and update times
  const createdAtFormatted = formatDate(note.createdAt);
  const updatedAtFormatted = formatDate(note.updatedAt);
  const showUpdated =
    note.updatedAt && note.createdAt && note.updatedAt !== note.createdAt;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link
            href="/"
            className="text-mercedes-primary hover:underline mb-2 inline-block"
          >
            &larr; Back to Just Noted
          </Link>
          <h1 className="text-2xl font-bold">{note.title}</h1>
          <p className="text-sm text-gray-500">
            Shared by <span className="font-semibold">{ownerUsername}</span> on{" "}
            {formatDate(note.createdAt)}
            {showUpdated && ` (Updated on ${formatDate(note.updatedAt)})`}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6">
          <div className="prose max-w-none">
            <TextBlock
              value={note.content}
              readOnly={true}
              placeholder="This note is empty..."
            />
          </div>
        </div>

        <div className="bg-gray-100 px-6 py-4 flex justify-between items-center">
          <div className="flex space-x-4 text-sm text-gray-600">
            <span>{wordCount} words</span>
            <span>{charCount} characters</span>
            <span>
              {localViewCount} view{localViewCount !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <div className="text-sm text-gray-500">
              <span>Share code: </span>
              <span className="font-mono">{shortcode}</span>
            </div>

            <button
              onClick={handleCopyLink}
              className={`px-3 py-1 ${
                copied ? "bg-green-500" : "bg-mercedes-primary"
              } text-white rounded text-sm transition-colors duration-300`}
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
