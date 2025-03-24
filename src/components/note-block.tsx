"use client";

import React, { useEffect, useState } from "react";
import TextBlock from "@/components/text-block";
import { Note } from "@/types/notes";
import {
  IconBrandApple,
  IconFileTypePdf,
  IconFileTypeTxt,
  IconPencil,
} from "@tabler/icons-react";

export default function NoteBlock({ details }: { details: Note }) {
  // States
  const [noteContent, setNoteContent] = useState(details.content);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  console.log(details.id);

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
    <section className={`col-span-12 flex flex-col gap-3`}>
      <article className={`flex gap-2 items-center`}>
        <div
          className={`group flex gap-2 items-center h-10 font-bold uppercase`}
        >
          <span>{details.title}</span>
          <div
            className={`w-fit max-w-0 group-hover:max-w-[999px] overflow-hidden transition-all duration-500 ease-in-out`}
          >
            <IconPencil
              className={`opacity-50 hover:opacity-100 text-mercedes-primary transition-all duration-300 ease-in-out`}
              size={20}
              strokeWidth={2}
            />
          </div>
        </div>

        <div className={`flex-grow h-0.5 bg-mercedes-primary`}></div>
      </article>

      {/* Note Content */}
      <article className={`grid grid-cols-12 gap-4`}>
        <div
          className={`col-span-12 sm:col-span-8 md:col-span-9 xl:col-span-10`}
        >
          <TextBlock
            value={noteContent}
            onChange={handleChange}
            placeholder="Just start typing..."
          />
        </div>

        <div
          className={`p-4 col-span-12 sm:col-span-4 md:col-span-3 xl:col-span-2 grid grid-cols-3 sm:flex sm:flex-col justify-center gap-2 bg-neutral-300 rounded-xl text-sm xs:text-lg sm:text-xl text-neutral-500/70 font-light capitalize`}
        >
          <p
            className={`p-1 xs:p-2 col-span-3 xs:col-span-1 flex xs:flex-col items-center justify-center gap-1 xs:gap-0 rounded-xl border border-neutral-400`}
          >
            <span
              className={`text-mercedes-primary text-lg xs:text-xl sm:text-2xl font-medium`}
            >
              {wordCount}
            </span>
            <span>words</span>
          </p>

          <p
            className={`p-1 xs:p-2 col-span-3 xs:col-span-1 flex xs:flex-col items-center justify-center gap-1 xs:gap-0 rounded-xl border border-neutral-400`}
          >
            <span
              className={`text-mercedes-primary text-lg xs:text-xl sm:text-2xl font-medium`}
            >
              {charCount}
            </span>
            <span>characters</span>
          </p>
        </div>
      </article>

      {/* Actions */}
      <article className={`flex gap-2 items-center`}>
        <div className={`flex-grow h-0.5 bg-mercedes-primary`}></div>
        <button
          type={`button`}
          className={`p-2 flex items-center justify-center gap-1 rounded-lg border-2 border-mercedes-primary hover:bg-mercedes-primary text-neutral-800 transition-all duration-300 ease-in-out`}
        >
          <IconFileTypeTxt size={20} strokeWidth={2} />
        </button>

        <button
          type={`button`}
          className={`p-2 flex items-center justify-center gap-1 rounded-lg border-2 border-mercedes-primary hover:bg-mercedes-primary text-neutral-800 transition-all duration-300 ease-in-out`}
        >
          <IconFileTypePdf size={20} strokeWidth={2} />
        </button>

        <button
          type={`button`}
          className={`p-2 flex items-center justify-center gap-1 rounded-lg border-2 border-mercedes-primary hover:bg-mercedes-primary text-neutral-800 transition-all duration-300 ease-in-out`}
        >
          <IconBrandApple size={20} strokeWidth={2} />
        </button>
      </article>
    </section>
  );
}
