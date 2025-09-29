"use client";

import React, { useEffect, useImperativeHandle, forwardRef } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { TextAlign } from "@tiptap/extension-text-align";
import { Typography } from "@tiptap/extension-typography";
import { Underline } from "@tiptap/extension-underline";
import { Placeholder } from "@tiptap/extension-placeholder";

import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  CheckSquare,
  HighlighterIcon,
} from "lucide-react";

interface TipTapEditorProps {
  markdown: string;
  onChange?: (markdown: string) => void;
  onReady?: () => void;
  placeholder?: string;
  className?: string;
  [key: string]: any;
}

interface TipTapEditorMethods {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  focus: () => void;
}

const TipTapEditor = forwardRef<TipTapEditorMethods, TipTapEditorProps>(
  (
    {
      markdown,
      onChange,
      onReady,
      placeholder = "Start typing...",
      className,
      ...props
    },
    ref,
  ) => {
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          history: {
            depth: 50,
          },
        }),
        Placeholder.configure({
          placeholder,
        }),
        Highlight.configure({
          multicolor: true,
        }),
        Image.configure({
          HTMLAttributes: {
            class: "max-w-full h-auto rounded-lg",
          },
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: "text-blue-600 underline cursor-pointer",
          },
        }),
        Subscript,
        Superscript,
        TaskList.configure({
          HTMLAttributes: {
            class: "not-prose",
          },
        }),
        TaskItem.configure({
          nested: true,
          HTMLAttributes: {
            class: "flex items-start gap-2",
          },
        }),
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
        Typography,
        Underline,
      ],
      content: markdown,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        const text = editor.getText();
        // Convert HTML to markdown-like format or use the text content
        // For simplicity, we'll use the HTML content. You might want to use a HTML-to-markdown converter
        if (onChange) {
          onChange(html);
        }
      },
      editorProps: {
        attributes: {
          class: `prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none max-w-none ${
            className || ""
          }`,
        },
      },
    });

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      getMarkdown: () => editor?.getHTML() || "",
      setMarkdown: (newMarkdown: string) => {
        if (editor && newMarkdown !== editor.getHTML()) {
          editor.commands.setContent(newMarkdown);
        }
      },
      focus: () => editor?.commands.focus(),
    }));

    // Handle content updates from props
    useEffect(() => {
      if (editor && markdown !== editor.getHTML()) {
        editor.commands.setContent(markdown);
      }
    }, [markdown, editor]);

    // Call onReady when editor is ready
    useEffect(() => {
      if (editor && onReady) {
        setTimeout(() => {
          onReady();
        }, 100);
      }
    }, [editor, onReady]);

    if (!editor) {
      return <div className="animate-pulse bg-neutral-200 h-64 rounded-lg" />;
    }

    return (
      <div className="rounded-lg">
        {/* Toolbar */}
        <div className="m-2 sticky top-2 left-0 right-0 border-b border-neutral-200 p-2 bg-neutral-100 rounded-xl flex flex-wrap gap-1 items-center z-50">
          {/* Undo/Redo */}
          <div className="flex gap-1 border-r border-neutral-300 pr-2 mr-2">
            <ToolbarButton
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              icon={<Undo size={16} />}
              title="Undo"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              icon={<Redo size={16} />}
              title="Redo"
            />
          </div>

          {/* Text Formatting */}
          <div className="flex gap-1 border-r border-neutral-300 pr-2 mr-2">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              isActive={editor.isActive("bold")}
              icon={<Bold size={16} />}
              title="Bold"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive("italic")}
              icon={<Italic size={16} />}
              title="Italic"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              isActive={editor.isActive("underline")}
              icon={<UnderlineIcon size={16} />}
              title="Underline"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleStrike().run()}
              isActive={editor.isActive("strike")}
              icon={<Strikethrough size={16} />}
              title="Strikethrough"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              isActive={editor.isActive("highlight")}
              icon={<HighlighterIcon size={16} />}
              title="Highlight"
            />
          </div>

          {/* Headings */}
          <div className="flex gap-1 border-r border-neutral-300 pr-2 mr-2">
            <ToolbarButton
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 1 }).run()
              }
              isActive={editor.isActive("heading", { level: 1 })}
              icon={<Heading1 size={16} />}
              title="Heading 1"
            />
            <ToolbarButton
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
              isActive={editor.isActive("heading", { level: 2 })}
              icon={<Heading2 size={16} />}
              title="Heading 2"
            />
            <ToolbarButton
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 3 }).run()
              }
              isActive={editor.isActive("heading", { level: 3 })}
              icon={<Heading3 size={16} />}
              title="Heading 3"
            />
          </div>

          {/* Lists */}
          <div className="flex gap-1">
            {/*<div className="flex gap-1 border-r border-neutral-300 pr-2 mr-2">*/}
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              isActive={editor.isActive("bulletList")}
              icon={<List size={16} />}
              title="Bullet List"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              isActive={editor.isActive("orderedList")}
              icon={<ListOrdered size={16} />}
              title="Numbered List"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              isActive={editor.isActive("taskList")}
              icon={<CheckSquare size={16} />}
              title="Task List"
            />
          </div>

          {/* Alignment */}
          {/*<div className="flex gap-1 border-r border-neutral-300 pr-2 mr-2">*/}
          {/*  <ToolbarButton*/}
          {/*    onClick={() => editor.chain().focus().setTextAlign("left").run()}*/}
          {/*    isActive={editor.isActive({ textAlign: "left" })}*/}
          {/*    icon={<AlignLeft size={16} />}*/}
          {/*    title="Align Left"*/}
          {/*  />*/}
          {/*  <ToolbarButton*/}
          {/*    onClick={() =>*/}
          {/*      editor.chain().focus().setTextAlign("center").run()*/}
          {/*    }*/}
          {/*    isActive={editor.isActive({ textAlign: "center" })}*/}
          {/*    icon={<AlignCenter size={16} />}*/}
          {/*    title="Align Center"*/}
          {/*  />*/}
          {/*  <ToolbarButton*/}
          {/*    onClick={() => editor.chain().focus().setTextAlign("right").run()}*/}
          {/*    isActive={editor.isActive({ textAlign: "right" })}*/}
          {/*    icon={<AlignRight size={16} />}*/}
          {/*    title="Align Right"*/}
          {/*  />*/}
          {/*</div>*/}

          {/* Link and Image */}
          {/*<div className="flex gap-1">*/}
          {/*  <ToolbarButton*/}
          {/*    onClick={() => {*/}
          {/*      const url = window.prompt("Enter URL:");*/}
          {/*      if (url) {*/}
          {/*        editor.chain().focus().setLink({ href: url }).run();*/}
          {/*      }*/}
          {/*    }}*/}
          {/*    isActive={editor.isActive("link")}*/}
          {/*    icon={<LinkIcon size={16} />}*/}
          {/*    title="Add Link"*/}
          {/*  />*/}
          {/*  <ToolbarButton*/}
          {/*    onClick={() => {*/}
          {/*      const url = window.prompt("Enter image URL:");*/}
          {/*      if (url) {*/}
          {/*        editor.chain().focus().setImage({ src: url }).run();*/}
          {/*      }*/}
          {/*    }}*/}
          {/*    icon={<ImageIcon size={16} />}*/}
          {/*    title="Add Image"*/}
          {/*  />*/}
          {/*</div>*/}
        </div>

        {/* Editor */}
        <EditorContent editor={editor} className={`px-4`} />
      </div>
    );
  },
);

// Toolbar Button Component
const ToolbarButton: React.FC<{
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
}> = ({ onClick, isActive = false, disabled = false, icon, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-1.5 rounded hover:bg-neutral-200 transition-colors ${
      isActive
        ? "bg-mercedes-primary/10 text-mercedes-primary"
        : "text-neutral-700"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
  >
    {icon}
  </button>
);

TipTapEditor.displayName = "TipTapEditor";

export default TipTapEditor;
