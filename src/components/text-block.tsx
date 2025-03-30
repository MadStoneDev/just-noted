"use client";

import React, { useRef, useEffect } from "react";

interface Props {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  [key: string]: any; // Allow for additional props to be passed
}

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

  // Convert line breaks properly for display
  const formatContentForDisplay = (content: string) => {
    // First, normalize all line breaks to \n
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Then convert \n to <br> for HTML display
    return normalized.replace(/\n/g, "<br>");
  };

  // Convert from displayed HTML back to plain text with proper line breaks
  const formatContentForStorage = (htmlContent: string) => {
    // Replace <br>, <div>, and <p> tags with appropriate line breaks
    return htmlContent
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<div><\/div>/gi, "\n")
      .replace(/<div>/gi, "\n")
      .replace(/<\/div>/gi, "")
      .replace(/<p><\/p>/gi, "\n")
      .replace(/<p>/gi, "")
      .replace(/<\/p>/gi, "\n");
  };

  // Effects
  useEffect(() => {
    if (!contentRef.current) return;

    if (isInitialMount.current) {
      // On initial mount, format the content properly
      contentRef.current.innerHTML = formatContentForDisplay(value);
      isInitialMount.current = false;
      return;
    }

    if (value !== previousValueRef.current) {
      // When value changes from outside, update the display
      contentRef.current.innerHTML = formatContentForDisplay(value);
      previousValueRef.current = value;
    }
  }, [value]);

  const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
    if (!contentRef.current) return;

    // Get the raw HTML content
    const htmlContent = contentRef.current.innerHTML;

    // Format for storage
    const formattedContent = formatContentForStorage(htmlContent);

    previousValueRef.current = formattedContent;

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
      const formattedPastedText = formatContentForDisplay(pastedText);

      const selection = document.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        // Create a temporary div to hold our formatted HTML
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = formattedPastedText;

        // Create a document fragment to insert
        const fragment = document.createDocumentFragment();
        while (tempDiv.firstChild) {
          fragment.appendChild(tempDiv.firstChild);
        }

        range.insertNode(fragment);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else {
      // For HTML paste, clean up but preserve line breaks
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = pastedHtml;

      const elements = tempDiv.querySelectorAll("*");
      elements.forEach((el) => {
        if (el instanceof HTMLElement) {
          el.style.color = "";
          el.style.backgroundColor = "";

          if (el.style.cssText) {
            el.style.cssText = el.style.cssText
              .replace(/color:[^;]+;?/gi, "")
              .replace(/background-color:[^;]+;?/gi, "");
          }
        }

        el.removeAttribute("color");
        el.removeAttribute("bgcolor");
      });

      const selection = document.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        const fragment = document.createDocumentFragment();
        const temp = document.createElement("div");
        temp.innerHTML = tempDiv.innerHTML;

        while (temp.firstChild) {
          fragment.appendChild(temp.firstChild);
        }

        range.insertNode(fragment);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    // Ensure onChange gets the updated content
    if (onChange && contentRef.current) {
      const updatedContent = formatContentForStorage(
        contentRef.current.innerHTML,
      );
      onChange(updatedContent);
      previousValueRef.current = updatedContent;
    }
  };

  // Handle the Enter key to insert proper line breaks
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Handle Enter key properly
    if (event.key === "Enter" && !event.shiftKey) {
      // Let the browser handle it naturally, but we'll convert the resulting
      // divs and ps to proper line breaks in handleInput
    }
  };

  return (
    <div
      ref={contentRef}
      onInput={handleInput}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
      contentEditable={true}
      data-placeholder={placeholder}
      suppressContentEditableWarning={true}
      className={`py-3 px-4 min-h-[250px] max-h-[600px] bg-white rounded-xl shadow-lg shadow-transparent hover:shadow-neutral-300 focus:shadow-neutral-300 outline-2 outline-transparent focus:outline-mercedes-primary font-light overflow-y-auto ${className} transition-all duration-300 ease-in-out whitespace-pre-wrap`}
      {...props}
    />
  );
}
