"use client";

import React, { useEffect, useState } from "react";
import TextBlock from "@/components/text-block";

export default function NoteBlock() {
  // States
  const [noteContent, setNoteContent] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Functions
  const handleChange = (value: string) => {
    setNoteContent(value);

    const words: string[] = value
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .trim()
      .split(/\s+/)
      .filter((word) => word !== "");

    const chars = value.replace(/<[^>]*>/g, "").trim();

    setWordCount(words.length);
    setCharCount(chars.length);
  };

  return (
    <>
      <div className={`col-span-12 sm:col-span-9 min-w-full`}>
        <TextBlock
          value={noteContent}
          onChange={handleChange}
          placeholder="Just start typing..."
        />
      </div>

      <div
        className={`col-span-12 sm:col-span-3 flex flex-col justify-center gap-2 text-xl text-neutral-400/70 font-light capitalize`}
      >
        <p className={`flex items-center gap-1`}>
          <span className={`text-mercedes-primary font-normal text-2xl`}>
            {wordCount}
          </span>{" "}
          words
        </p>
        <p>
          <span className={`text-mercedes-primary font-normal text-2xl`}>
            {charCount}
          </span>{" "}
          characters
        </p>
      </div>
    </>
  );
}
