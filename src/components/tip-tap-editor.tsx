"use client";

import React, {
  useEffect,
  useImperativeHandle,
  forwardRef,
  useRef,
  useCallback,
  useState,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
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
  CheckSquare,
  HighlighterIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ImageIcon,
  Link as LinkIcon,
  Quote,
  Code,
  Minus,
  RemoveFormatting,
} from "lucide-react";

import { useNotesStore } from "@/stores/notes-store";
import TextTransformMenu from "@/components/ui/text-transform-menu";
import ImageUpload from "@/components/ui/image-upload";
import FormatInspector from "@/components/ui/format-inspector";

/**
 * Validates that a URL is safe for use in links/images
 * Only allows http, https, and mailto protocols
 */
function isValidUrl(url: string): boolean {
  // Explicitly block dangerous protocols before parsing
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith("javascript:") || trimmed.startsWith("data:") || trimmed.startsWith("vbscript:")) {
    return false;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    // Only allow safe protocols
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    // If URL is invalid, check if it's a relative path
    return url.startsWith("/") && !url.startsWith("//");
  }
}

interface TipTapEditorProps {
  noteId?: string;
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
      noteId,
      markdown,
      onChange,
      onReady,
      placeholder = "Start typing...",
      className,
      ...props
    },
    ref,
  ) => {
    // Track whether editor is actively being used - this prevents external updates from resetting cursor
    const isUserEditingRef = useRef(false);
    const isFocusedRef = useRef(false);
    const editingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastContentRef = useRef(markdown);

    // State for image upload modal
    const [showImageUpload, setShowImageUpload] = useState(false);

    // Get setEditing from store - use a stable reference
    const setEditing = useNotesStore((state) => state.setEditing);

    // Stable callback for marking editing state
    const markEditing = useCallback((editing: boolean) => {
      if (noteId) {
        setEditing(noteId, editing);
      }
    }, [noteId, setEditing]);

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
        // Mark as actively editing
        isUserEditingRef.current = true;
        markEditing(true);

        // Clear previous timeout
        if (editingTimeoutRef.current) {
          clearTimeout(editingTimeoutRef.current);
        }

        // After 3 seconds of no typing, allow external updates again
        editingTimeoutRef.current = setTimeout(() => {
          isUserEditingRef.current = false;
          if (!isFocusedRef.current) {
            markEditing(false);
          }
        }, 3000);

        const html = editor.getHTML();
        lastContentRef.current = html;

        if (onChange) {
          onChange(html);
        }
      },
      onFocus: () => {
        isFocusedRef.current = true;
        isUserEditingRef.current = true;
        markEditing(true);
      },
      onBlur: () => {
        isFocusedRef.current = false;

        // Clear editing timeout
        if (editingTimeoutRef.current) {
          clearTimeout(editingTimeoutRef.current);
        }

        // Delay clearing editing state to allow save operations to complete
        editingTimeoutRef.current = setTimeout(() => {
          isUserEditingRef.current = false;
          markEditing(false);
        }, 1000);
      },
      editorProps: {
        attributes: {
          class: `prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none max-w-none ${
            className || ""
          }`,
        },
      },
      immediatelyRender: false,
    });

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      getMarkdown: () => editor?.getHTML() || "",
      setMarkdown: (newMarkdown: string) => {
        // Only allow external setMarkdown if user is not actively editing
        if (editor && !isUserEditingRef.current && !isFocusedRef.current) {
          if (newMarkdown !== editor.getHTML()) {
            editor.commands.setContent(newMarkdown);
            lastContentRef.current = newMarkdown;
          }
        }
      },
      focus: () => editor?.commands.focus(),
    }));

    // Handle content updates from props - ONLY when user is not editing
    useEffect(() => {
      if (!editor) return;

      // CRITICAL: Don't update content while user is editing or focused
      // This prevents the cursor from jumping to the end
      if (isUserEditingRef.current || isFocusedRef.current) {
        return;
      }

      // Only update if content actually changed from external source
      if (markdown !== lastContentRef.current && markdown !== editor.getHTML()) {
        editor.commands.setContent(markdown);
        lastContentRef.current = markdown;
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

    // Cleanup on unmount - use refs to avoid dependency issues
    useEffect(() => {
      const currentNoteId = noteId;

      return () => {
        if (editingTimeoutRef.current) {
          clearTimeout(editingTimeoutRef.current);
        }
        if (currentNoteId) {
          // Use getState to avoid stale closure
          useNotesStore.getState().setEditing(currentNoteId, false);
        }
      };
    }, [noteId]);

    if (!editor) {
      return <div className="animate-pulse bg-neutral-200 h-64 rounded-lg" />;
    }

    return (
      <div className="rounded-lg">
        {/* Toolbar */}
        <div className="m-2 sticky top-2 left-0 right-0 border border-neutral-200/60 p-2 bg-white/90 backdrop-blur-sm rounded-xl flex gap-1 items-center shadow-sm overflow-x-auto z-50">
          {/* Undo/Redo */}
          <div className="flex gap-1 border-r border-neutral-200/50 pr-2 mr-2">
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
          <div className="flex gap-1 border-r border-neutral-200/50 pr-2 mr-2">
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
            <ToolbarButton
              onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
              icon={<RemoveFormatting size={16} />}
              title="Clear Formatting"
            />
          </div>

          {/* Headings */}
          <div className="flex gap-1 border-r border-neutral-200/50 pr-2 mr-2">
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
          <div className="flex gap-1 border-r border-neutral-200/50 pr-2 mr-2">
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
          <div className="flex gap-1 border-r border-neutral-200/50 pr-2 mr-2">
            <ToolbarButton
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
              isActive={editor.isActive({ textAlign: "left" })}
              icon={<AlignLeft size={16} />}
              title="Align Left"
            />
            <ToolbarButton
              onClick={() =>
                editor.chain().focus().setTextAlign("center").run()
              }
              isActive={editor.isActive({ textAlign: "center" })}
              icon={<AlignCenter size={16} />}
              title="Align Center"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
              isActive={editor.isActive({ textAlign: "right" })}
              icon={<AlignRight size={16} />}
              title="Align Right"
            />
          </div>

          {/* Additional Tools */}
          <div className="flex gap-1 border-r border-neutral-200/50 pr-2 mr-2">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              isActive={editor.isActive("blockquote")}
              icon={<Quote size={16} />}
              title="Blockquote"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              isActive={editor.isActive("codeBlock")}
              icon={<Code size={16} />}
              title="Code Block"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              icon={<Minus size={16} />}
              title="Horizontal Rule"
            />
          </div>

          {/* Image & Link */}
          <div className="flex gap-1 border-r border-neutral-200/50 pr-2 mr-2">
            <ToolbarButton
              onClick={() => setShowImageUpload(true)}
              icon={<ImageIcon size={16} />}
              title="Insert Image"
            />
            <ToolbarButton
              onClick={() => {
                const url = window.prompt("Enter link URL:");
                if (url) {
                  // Validate URL to prevent javascript: and other dangerous protocols
                  if (isValidUrl(url)) {
                    editor.chain().focus().setLink({ href: url }).run();
                  } else {
                    console.warn("Invalid URL rejected:", url);
                  }
                } else {
                  editor.chain().focus().unsetLink().run();
                }
              }}
              isActive={editor.isActive("link")}
              icon={<LinkIcon size={16} />}
              title="Insert Link"
            />
          </div>

          {/* Text Transform */}
          <div className="flex gap-1">
            <TextTransformMenu editor={editor} />
          </div>
        </div>

        {/* Format Inspector (Bubble Menu) */}
        <FormatInspector editor={editor} />

        {/* Editor */}
        <EditorContent editor={editor} className={`px-4`} />

        {/* Image Upload Modal */}
        {showImageUpload && (
          <ImageUpload
            onInsertImage={(src, alt) => {
              // Validate image URL to prevent javascript: and other dangerous protocols
              if (isValidUrl(src)) {
                editor.chain().focus().setImage({ src, alt }).run();
              } else {
                console.warn("Invalid image URL rejected:", src);
              }
            }}
            onClose={() => setShowImageUpload(false)}
          />
        )}
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
    className={`p-2 rounded-md hover:bg-neutral-100 transition-all duration-150 ${
      isActive
        ? "bg-mercedes-primary/10 text-mercedes-primary shadow-sm"
        : "text-neutral-500 hover:text-neutral-700"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
  >
    {icon}
  </button>
);

TipTapEditor.displayName = "TipTapEditor";

export default TipTapEditor;
