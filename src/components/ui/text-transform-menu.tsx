"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Editor } from "@tiptap/react";
import {
  IconLetterCase,
  IconLetterCaseUpper,
  IconLetterCaseLower,
  IconTextCaption,
  IconChevronDown,
} from "@tabler/icons-react";

interface TextTransformMenuProps {
  editor: Editor | null;
}

type TransformType = "uppercase" | "lowercase" | "capitalize" | "sentence" | "toggle";

export default function TextTransformMenu({ editor }: TextTransformMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate menu position when opening
  const updateMenuPosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - 220), // Ensure menu doesn't go off-screen
      });
    }
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleScroll = () => {
      if (isOpen) {
        updateMenuPosition();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", handleScroll, true);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen, updateMenuPosition]);

  const transformText = (type: TransformType) => {
    if (!editor) return;

    const { from, to, empty } = editor.state.selection;

    if (empty) {
      // No selection - show a hint or do nothing
      return;
    }

    const selectedText = editor.state.doc.textBetween(from, to, " ");

    let transformedText: string;

    switch (type) {
      case "uppercase":
        transformedText = selectedText.toUpperCase();
        break;
      case "lowercase":
        transformedText = selectedText.toLowerCase();
        break;
      case "capitalize":
        // Title Case - capitalize first letter of each word
        transformedText = selectedText
          .toLowerCase()
          .replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());
        break;
      case "sentence":
        // Sentence case - capitalize first letter of each sentence
        transformedText = selectedText
          .toLowerCase()
          .replace(/(^\s*\w|[.!?]\s*\w)/g, (char) => char.toUpperCase());
        break;
      case "toggle":
        // Toggle case - swap upper/lower
        transformedText = selectedText
          .split("")
          .map((char) =>
            char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase()
          )
          .join("");
        break;
      default:
        transformedText = selectedText;
    }

    // Replace the selected text
    editor
      .chain()
      .focus()
      .deleteSelection()
      .insertContent(transformedText)
      .run();

    setIsOpen(false);
  };

  const menuItems = [
    {
      type: "uppercase" as TransformType,
      label: "UPPERCASE",
      icon: <IconLetterCaseUpper size={16} />,
      shortcut: "ABC → ABC",
    },
    {
      type: "lowercase" as TransformType,
      label: "lowercase",
      icon: <IconLetterCaseLower size={16} />,
      shortcut: "ABC → abc",
    },
    {
      type: "capitalize" as TransformType,
      label: "Capitalize Words",
      icon: <IconTextCaption size={16} />,
      shortcut: "abc def → Abc Def",
    },
    {
      type: "sentence" as TransformType,
      label: "Sentence case",
      icon: <IconLetterCase size={16} />,
      shortcut: "ABC. DEF → Abc. Def",
    },
    {
      type: "toggle" as TransformType,
      label: "tOGGLE cASE",
      icon: <IconLetterCase size={16} className="rotate-180" />,
      shortcut: "AbC → aBc",
    },
  ];

  const handleToggle = () => {
    if (!isOpen) {
      updateMenuPosition();
    }
    setIsOpen(!isOpen);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`p-1.5 rounded hover:bg-neutral-200 transition-colors flex items-center gap-0.5 ${
          isOpen ? "bg-neutral-200" : ""
        }`}
        title="Text Transform (select text first)"
      >
        <IconLetterCase size={16} />
        <IconChevronDown size={12} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="fixed bg-white rounded-lg shadow-xl border border-neutral-200 py-1 min-w-[200px] z-[100]"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <div className="px-3 py-1.5 text-xs font-medium text-neutral-500 border-b border-neutral-100">
            Transform Selected Text
          </div>
          {menuItems.map((item) => (
            <button
              key={item.type}
              onClick={() => transformText(item.type)}
              className="w-full px-3 py-2 text-left hover:bg-neutral-50 flex items-center justify-between gap-2 transition-colors"
            >
              <div className="flex items-center gap-2">
                {item.icon}
                <span className="text-sm">{item.label}</span>
              </div>
              <span className="text-xs text-neutral-400">{item.shortcut}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
