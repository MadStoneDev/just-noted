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
  const contentRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  const previousValueRef = useRef<string>(value);

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

  return (
    <div
      ref={contentRef}
      className={`py-3 px-4 min-h-[250px] max-h-[600px] bg-white rounded-xl shadow-lg shadow-transparent hover:shadow-neutral-300 focus:shadow-neutral-300 outline-2 outline-transparent focus:outline-mercedes-primary font-light overflow-y-auto ${className} transition-all duration-300 ease-in-out`}
      contentEditable={true}
      onInput={handleInput}
      suppressContentEditableWarning={true}
      data-placeholder={placeholder}
      {...props}
    />
  );
}
