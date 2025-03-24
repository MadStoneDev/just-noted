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

  // Effects
  useEffect(() => {
    if (!contentRef.current) return;

    if (isInitialMount.current) {
      contentRef.current.innerHTML = value;
      isInitialMount.current = false;
      return;
    }

    if (value !== previousValueRef.current) {
      contentRef.current.innerHTML = value;
      previousValueRef.current = value;
    }
  }, [value]);

  const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
    const newValue = event.currentTarget.innerHTML;
    previousValueRef.current = newValue;

    if (onChange) {
      onChange(newValue);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();

    const pastedHtml = event.clipboardData.getData("text/html");

    if (!pastedHtml) {
      const pastedText = event.clipboardData.getData("text/plain");
      const selection = document.getSelection();

      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(pastedText);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else {
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

    if (onChange && contentRef.current) {
      onChange(contentRef.current.innerHTML);
    }
  };

  return (
    <div
      ref={contentRef}
      onInput={handleInput}
      onPaste={handlePaste}
      contentEditable={true}
      data-placeholder={placeholder}
      suppressContentEditableWarning={true}
      className={`py-3 px-4 min-h-[250px] max-h-[600px] bg-white rounded-xl shadow-lg shadow-transparent hover:shadow-neutral-300 focus:shadow-neutral-300 outline-2 outline-transparent focus:outline-mercedes-primary font-light overflow-y-auto ${className} transition-all duration-300 ease-in-out`}
      {...props}
    />
  );
}
