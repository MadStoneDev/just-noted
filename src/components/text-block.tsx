"use client";

import React from "react";

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
  // Handle changes to the contenteditable div
  const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
    if (onChange) {
      onChange(event.currentTarget.innerHTML);
    }
  };

  return (
    <div
      className={`py-3 px-4 min-h-[200px] max-h-[600px] bg-white rounded-lg shadow-lg shadow-neutral-200/20 outline-2 outline-transparent focus:outline-mercedes-primary font-light overflow-y-auto ${className} transition-all duration-300 ease-in-out`}
      contentEditable={true}
      onInput={handleInput}
      data-placeholder={placeholder}
      {...props}
    />
  );
}
