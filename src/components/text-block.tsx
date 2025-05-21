"use client";

import React, { useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Dynamic import to prevent SSR issues
const MDEditorComponent = dynamic(() => import("./md-editor-initialiser"), {
  ssr: false,
});

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
  // States
  const [showTips] = useState(true); // Always show tips

  // Create a ref to the editor
  const editorRef = useRef(null);

  // Handle onChange event
  const handleChange = (newContent: string) => {
    if (onChange) {
      onChange(newContent);
    }
  };

  // Check if content is empty to handle placeholder correctly
  const isEmpty = !value || value.trim() === "";

  return (
    <div className="text-editor-container">
      <MDEditorComponent
        editorRef={editorRef}
        markdown={isEmpty ? "" : value}
        onChange={handleChange}
        placeholder={placeholder}
        className={`editor-content relative p-3 min-h-[250px] max-h-[500px] bg-white rounded-xl shadow-lg shadow-transparent hover:shadow-neutral-300 focus:shadow-neutral-300 outline-2 outline-transparent focus:outline-mercedes-primary font-light overflow-y-auto whitespace-pre-wrap ${className} transition-all duration-300 ease-in-out`}
        {...props}
      />
    </div>
  );
}
