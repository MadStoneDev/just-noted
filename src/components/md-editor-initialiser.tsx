"use client";

import {
  MDXEditor,
  UndoRedo,
  listsPlugin,
  headingsPlugin,
  ListsToggle,
  BoldItalicUnderlineToggles,
  StrikeThroughSupSubToggles,
  toolbarPlugin,
  BlockTypeSelect,
  markdownShortcutPlugin,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { ForwardedRef } from "react";

// Creating a component that initializes MDXEditor with the necessary plugins
export default function MDEditorInitializer({
  editorRef,
  markdown,
  onChange,
  placeholder,
  className,
  ...props
}: {
  editorRef: ForwardedRef<MDXEditorMethods> | null;
  markdown: string;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  className?: string;
  [key: string]: any;
}) {
  // Tailwind classes for editor styling
  const editorClasses = `${className} mdx-editor-custom`;

  return (
    <MDXEditor
      ref={editorRef}
      markdown={markdown}
      onChange={onChange}
      placeholder={placeholder}
      className={editorClasses}
      contentEditableClassName={`min-h-[240px] outline-none custom-editor-content`}
      plugins={[
        listsPlugin(),
        headingsPlugin(),
        markdownShortcutPlugin(),
        toolbarPlugin({
          toolbarContents: () => (
            <div className={`flex flex-wrap gap-1 items-center`}>
              <UndoRedo />
              <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
              <StrikeThroughSupSubToggles options={["Strikethrough"]} />
              <BlockTypeSelect />
              <ListsToggle />
            </div>
          ),
        }),
      ]}
      {...props}
    />
  );
}
