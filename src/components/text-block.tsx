"use client";

import React, { useRef, useEffect, useState } from "react";

interface Props {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  [key: string]: any; // Allow for additional props to be passed
}

// Define custom styles for the editor
const editorStyles = `
  .editor-content strong, .editor-content b {
    font-weight: 700 !important; /* Bolder than default */
  }
  
  .editor-content em, .editor-content i {
    font-style: italic !important;
  }
  
  .editor-content del, .editor-content strike {
    text-decoration: line-through !important;
    text-decoration-thickness: 1px !important;
  }
  
  .editor-content[data-empty="true"]::before {
    content: attr(data-placeholder);
    color: #9ca3af; /* Gray-400 */
    pointer-events: none;
    position: absolute;
  }
`;

export default function TextBlock({
  value,
  onChange,
  placeholder = "Start typing...",
  className = "",
  ...props
}: Props) {
  // Refs
  const previousValueRef = useRef<string>(value);
  const isInitialMount = useRef(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showMarkdownTip, setShowMarkdownTip] = useState(true);

  // Handle line breaks properly
  const convertLineBreaks = (content: string) => {
    // First, normalize all line breaks to \n
    let formatted = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Then convert \n to <br> for HTML display
    return formatted.replace(/\n/g, "<br>");
  };

  // Handle line breaks in HTML content
  const formatLineBreaksForStorage = (htmlContent: string) => {
    return htmlContent
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<div><\/div>/gi, "\n")
      .replace(/<div>/gi, "\n")
      .replace(/<\/div>/gi, "")
      .replace(/<p><\/p>/gi, "\n")
      .replace(/<p>/gi, "")
      .replace(/<\/p>/gi, "\n");
  };

  // Check if content is empty
  const updateEmptyState = () => {
    if (contentRef.current) {
      const isEmpty =
        contentRef.current.innerHTML.trim() === "" ||
        contentRef.current.innerHTML.trim() === "<br>";

      contentRef.current.setAttribute("data-empty", isEmpty ? "true" : "false");
    }
  };

  // Effects
  useEffect(() => {
    if (!contentRef.current) return;

    if (isInitialMount.current) {
      // On initial mount, format the content properly (just handle line breaks)
      contentRef.current.innerHTML = convertLineBreaks(value);
      updateEmptyState();
      isInitialMount.current = false;
      return;
    }

    if (value !== previousValueRef.current) {
      // When value changes from outside, update the display
      contentRef.current.innerHTML = convertLineBreaks(value);
      updateEmptyState();
      previousValueRef.current = value;
    }
  }, [value]);

  // Add styles to the document head
  useEffect(() => {
    // Add custom styles to document head
    const styleElement = document.createElement("style");
    styleElement.innerHTML = editorStyles;
    document.head.appendChild(styleElement);

    // Cleanup on unmount
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
    if (!contentRef.current) return;

    // Get the raw HTML content
    const htmlContent = contentRef.current.innerHTML;

    // Just handle line breaks for now
    const formattedContent = formatLineBreaksForStorage(htmlContent);

    previousValueRef.current = formattedContent;
    updateEmptyState();

    if (onChange) {
      onChange(formattedContent);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();

    // Handle pasted content
    const pastedHtml = event.clipboardData.getData("text/html");

    if (!pastedHtml) {
      // For plain text paste, preserve line breaks
      const pastedText = event.clipboardData.getData("text/plain");
      const formattedPastedText = convertLineBreaks(pastedText);

      // Insert the formatted HTML
      document.execCommand("insertHTML", false, formattedPastedText);
    } else {
      // For HTML paste, clean up but preserve line breaks and basic formatting
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = pastedHtml;

      const elements = tempDiv.querySelectorAll("*");
      elements.forEach((el) => {
        if (el instanceof HTMLElement) {
          // Remove all styles except basic formatting
          el.style.cssText = "";

          // Keep only certain attributes and tags
          for (let i = el.attributes.length - 1; i >= 0; i--) {
            const name = el.attributes[i].name;
            if (name !== "href") {
              el.removeAttribute(name);
            }
          }
        }
      });

      // Insert the cleaned HTML
      document.execCommand("insertHTML", false, tempDiv.innerHTML);
    }

    // Ensure onChange gets the updated content
    if (onChange && contentRef.current) {
      const updatedContent = formatLineBreaksForStorage(
        contentRef.current.innerHTML,
      );
      onChange(updatedContent);
      previousValueRef.current = updatedContent;
      updateEmptyState();
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Handle keyboard shortcuts
    if (event.ctrlKey) {
      // Bold: Ctrl+B
      if (event.key === "b") {
        event.preventDefault();
        document.execCommand("bold", false);
        setShowMarkdownTip(false); // User knows shortcuts, hide the tip
      }

      // Italic: Ctrl+I
      if (event.key === "i") {
        event.preventDefault();
        document.execCommand("italic", false);
        setShowMarkdownTip(false);
      }

      // Strikethrough: Ctrl+D (custom)
      if (event.key === "d") {
        event.preventDefault();
        document.execCommand("strikeThrough", false);
        setShowMarkdownTip(false);
      }

      // Update after keyboard shortcut
      if (
        (event.key === "b" || event.key === "i" || event.key === "d") &&
        onChange &&
        contentRef.current
      ) {
        const htmlContent = contentRef.current.innerHTML;
        const formattedContent = formatLineBreaksForStorage(htmlContent);
        onChange(formattedContent);
        previousValueRef.current = formattedContent;
      }
    }
  };

  // Add a simple formatting toolbar
  const formatBold = () => {
    if (contentRef.current) {
      contentRef.current.focus();
      document.execCommand("bold", false);

      if (onChange) {
        const htmlContent = contentRef.current.innerHTML;
        const formattedContent = formatLineBreaksForStorage(htmlContent);
        onChange(formattedContent);
        previousValueRef.current = formattedContent;
      }

      setShowMarkdownTip(false);
    }
  };

  const formatItalic = () => {
    if (contentRef.current) {
      contentRef.current.focus();
      document.execCommand("italic", false);

      if (onChange) {
        const htmlContent = contentRef.current.innerHTML;
        const formattedContent = formatLineBreaksForStorage(htmlContent);
        onChange(formattedContent);
        previousValueRef.current = formattedContent;
      }

      setShowMarkdownTip(false);
    }
  };

  const formatStrikethrough = () => {
    if (contentRef.current) {
      contentRef.current.focus();
      document.execCommand("strikeThrough", false);

      if (onChange) {
        const htmlContent = contentRef.current.innerHTML;
        const formattedContent = formatLineBreaksForStorage(htmlContent);
        onChange(formattedContent);
        previousValueRef.current = formattedContent;
      }

      setShowMarkdownTip(false);
    }
  };

  return (
    <div className="text-editor-container">
      <div className="formatting-toolbar flex items-center gap-3 mb-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={formatBold}
            className="p-1 border border-neutral-300 rounded hover:bg-neutral-100 w-8 h-8 flex items-center justify-center"
            title="Bold (Ctrl+B)"
          >
            <span className="font-bold text-base">B</span>
          </button>
          <button
            type="button"
            onClick={formatItalic}
            className="p-1 border border-neutral-300 rounded hover:bg-neutral-100 w-8 h-8 flex items-center justify-center"
            title="Italic (Ctrl+I)"
          >
            <span className="italic text-base">I</span>
          </button>
          <button
            type="button"
            onClick={formatStrikethrough}
            className="p-1 border border-neutral-300 rounded hover:bg-neutral-100 w-8 h-8 flex items-center justify-center"
            title="Strikethrough (Ctrl+D)"
          >
            <span className="line-through text-base">S</span>
          </button>
        </div>

        {showMarkdownTip && (
          <div className="text-xs text-neutral-500 opacity-80">
            Use keyboard shortcuts: Ctrl+B (bold), Ctrl+I (italic), Ctrl+D
            (strikethrough)
          </div>
        )}
      </div>

      <div
        ref={contentRef}
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        contentEditable={true}
        data-placeholder={placeholder}
        data-empty="true"
        suppressContentEditableWarning={true}
        className={`editor-content relative py-3 px-4 min-h-[250px] max-h-[600px] bg-white rounded-xl shadow-lg shadow-transparent hover:shadow-neutral-300 focus:shadow-neutral-300 outline-2 outline-transparent focus:outline-mercedes-primary font-light overflow-y-auto whitespace-pre-wrap ${className} transition-all duration-300 ease-in-out`}
        {...props}
      />
    </div>
  );
}
