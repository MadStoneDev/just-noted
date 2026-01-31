"use client";

import React, { useCallback, useMemo, useState, useEffect } from "react";
import { BubbleMenu, Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Link,
  Code,
  X,
  Subscript,
  Superscript,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  List,
  ListOrdered,
  CheckSquare,
  FileCode,
} from "lucide-react";

interface FormatInspectorProps {
  editor: Editor;
}

interface DetectedStyle {
  type: "background" | "color" | "font-size" | "font-family";
  value: string;
  label: string;
}

interface FormatBadgeProps {
  icon?: React.ReactNode;
  label?: string;
  title: string;
  isActive: boolean;
  onClick: () => void;
  variant?: "mark" | "style" | "block";
}

const FormatBadge: React.FC<FormatBadgeProps> = ({
  icon,
  label,
  title,
  isActive,
  onClick,
  variant = "mark",
}) => {
  if (!isActive) return null;

  const variantStyles = {
    mark: "bg-neutral-200 text-neutral-700 hover:bg-neutral-300",
    style: "bg-amber-100 text-amber-800 hover:bg-amber-200",
    block: "bg-blue-100 text-blue-800 hover:bg-blue-200",
  };

  return (
    <button
      onClick={onClick}
      title={`Remove ${title}`}
      className={`
        flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium
        transition-colors cursor-pointer
        ${variantStyles[variant]}
      `}
    >
      {icon}
      {label && <span>{label}</span>}
      <X size={10} className="ml-0.5 opacity-60" />
    </button>
  );
};

const FormatInspector: React.FC<FormatInspectorProps> = ({ editor }) => {
  // Track if user is actively typing - hide inspector while typing
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);

  // Listen for typing to hide inspector
  useEffect(() => {
    const handleTransaction = ({ transaction }: { transaction: any }) => {
      // Check if this is a text input transaction
      if (transaction.docChanged && transaction.steps.length > 0) {
        setIsTyping(true);

        // Clear existing timeout
        if (typingTimeout) {
          clearTimeout(typingTimeout);
        }

        // Show again after user stops typing
        const timeout = setTimeout(() => {
          setIsTyping(false);
        }, 500);

        setTypingTimeout(timeout);
      }
    };

    editor.on("transaction", handleTransaction);

    return () => {
      editor.off("transaction", handleTransaction);
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
    };
  }, [editor, typingTimeout]);

  // Check if selection is empty (cursor only)
  const isEmptySelection = useCallback(() => {
    const { from, to } = editor.state.selection;
    return from === to;
  }, [editor]);

  // Smart mark removal - extends to full mark range if cursor only
  const removeMarkSmart = useCallback((markName: string) => {
    if (isEmptySelection()) {
      // Extend to full mark range before removing
      editor.chain().focus().extendMarkRange(markName).unsetMark(markName).run();
    } else {
      editor.chain().focus().unsetMark(markName).run();
    }
  }, [editor, isEmptySelection]);

  // Detect inline styles from DOM elements at cursor/selection
  const detectInlineStyles = useCallback((): DetectedStyle[] => {
    const { view, state } = editor;
    const { from, to } = state.selection;

    const styles: DetectedStyle[] = [];
    const seenStyles = new Set<string>();

    try {
      // For cursor position, check at cursor; for selection, check range
      const checkFrom = from;
      const checkTo = from === to ? from + 1 : to;

      state.doc.nodesBetween(checkFrom, Math.min(checkTo, state.doc.content.size), (node, pos) => {
        if (!node.isText) return;

        // Get DOM position for this text node
        const domPos = view.domAtPos(pos);
        let element = domPos.node as HTMLElement;

        // Walk up to find elements with style attributes
        while (element && element !== view.dom) {
          if (element.style) {
            // Check background color
            const bgColor =
              element.style.backgroundColor || element.style.background;
            if (bgColor && !seenStyles.has(`bg:${bgColor}`)) {
              seenStyles.add(`bg:${bgColor}`);
              styles.push({
                type: "background",
                value: bgColor,
                label: `bg: ${formatColorValue(bgColor)}`,
              });
            }

            // Check text color
            const textColor = element.style.color;
            if (textColor && !seenStyles.has(`color:${textColor}`)) {
              seenStyles.add(`color:${textColor}`);
              styles.push({
                type: "color",
                value: textColor,
                label: `text: ${formatColorValue(textColor)}`,
              });
            }

            // Check font size
            const fontSize = element.style.fontSize;
            if (fontSize && !seenStyles.has(`size:${fontSize}`)) {
              seenStyles.add(`size:${fontSize}`);
              styles.push({
                type: "font-size",
                value: fontSize,
                label: `size: ${fontSize}`,
              });
            }

            // Check font family
            const fontFamily = element.style.fontFamily;
            if (fontFamily && !seenStyles.has(`font:${fontFamily}`)) {
              seenStyles.add(`font:${fontFamily}`);
              const shortFamily = fontFamily.split(",")[0].replace(/['"]/g, "");
              styles.push({
                type: "font-family",
                value: fontFamily,
                label: `font: ${shortFamily}`,
              });
            }
          }

          element = element.parentElement as HTMLElement;
        }
      });
    } catch (e) {
      // Silently handle DOM access errors
    }

    return styles;
  }, [editor]);

  // Format color values for display
  const formatColorValue = (color: string): string => {
    // Convert rgb to simpler format
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch;
      // Check for common colors
      if (r === "0" && g === "128" && b === "0") return "green";
      if (r === "255" && g === "0" && b === "0") return "red";
      if (r === "0" && g === "0" && b === "255") return "blue";
      if (r === "255" && g === "255" && b === "0") return "yellow";
      // Return hex for others
      return `#${parseInt(r).toString(16).padStart(2, "0")}${parseInt(g).toString(16).padStart(2, "0")}${parseInt(b).toString(16).padStart(2, "0")}`;
    }
    return color;
  };

  // Remove inline styles - works for both cursor and selection
  const removeInlineStyles = useCallback(() => {
    const { state } = editor;
    let { from, to } = state.selection;
    const empty = from === to;

    if (empty) {
      // Find the extent of the styled content around cursor
      // For now, select the current word/node and remove styles
      const $from = state.selection.$from;
      const node = $from.parent;
      from = $from.start();
      to = $from.end();
    }

    // Get plain text content
    const text = state.doc.textBetween(from, to, " ");

    // Replace with plain text (removes all marks and styles)
    editor
      .chain()
      .focus()
      .setTextSelection({ from, to })
      .deleteSelection()
      .insertContent(text)
      .run();
  }, [editor]);

  // Memoized active marks check
  const activeMarks = useMemo(() => {
    return {
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      highlight: editor.isActive("highlight"),
      link: editor.isActive("link"),
      code: editor.isActive("code"),
      subscript: editor.isActive("subscript"),
      superscript: editor.isActive("superscript"),
    };
  }, [editor, editor.state.selection]);

  // Memoized active block-level formatting
  const activeBlocks = useMemo(() => {
    return {
      heading1: editor.isActive("heading", { level: 1 }),
      heading2: editor.isActive("heading", { level: 2 }),
      heading3: editor.isActive("heading", { level: 3 }),
      blockquote: editor.isActive("blockquote"),
      codeBlock: editor.isActive("codeBlock"),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      taskList: editor.isActive("taskList"),
    };
  }, [editor, editor.state.selection]);

  const inlineStyles = detectInlineStyles();

  const hasAnyMarks = Object.values(activeMarks).some(Boolean);
  const hasAnyBlocks = Object.values(activeBlocks).some(Boolean);
  const hasAnyFormatting = hasAnyMarks || hasAnyBlocks || inlineStyles.length > 0;

  // Determine if we should show the inspector
  const shouldShowInspector = useCallback(({ editor: e, state }: { editor: Editor; state: any }) => {
    // Don't show while typing
    if (isTyping) return false;

    // Check if there's any formatting at current position
    const hasMarks =
      e.isActive("bold") ||
      e.isActive("italic") ||
      e.isActive("underline") ||
      e.isActive("strike") ||
      e.isActive("highlight") ||
      e.isActive("link") ||
      e.isActive("code") ||
      e.isActive("subscript") ||
      e.isActive("superscript");

    const hasBlocks =
      e.isActive("heading", { level: 1 }) ||
      e.isActive("heading", { level: 2 }) ||
      e.isActive("heading", { level: 3 }) ||
      e.isActive("blockquote") ||
      e.isActive("codeBlock") ||
      e.isActive("bulletList") ||
      e.isActive("orderedList") ||
      e.isActive("taskList");

    // Show if there's any formatting (even with just cursor)
    return hasMarks || hasBlocks;
  }, [isTyping]);

  // Don't render if nothing to show
  if (!hasAnyFormatting && !isTyping) {
    return (
      <BubbleMenu
        editor={editor}
        tippyOptions={{
          duration: 100,
          placement: "top",
        }}
        shouldShow={shouldShowInspector}
      >
        {null}
      </BubbleMenu>
    );
  }

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 100,
        placement: "top",
        maxWidth: 450,
      }}
      shouldShow={shouldShowInspector}
    >
      <div className="bg-white rounded-lg shadow-lg border border-neutral-200 px-2 py-1.5 flex items-center gap-1 flex-wrap max-w-[430px]">
        {/* Block-level formatting (blue badges) */}
        <FormatBadge
          icon={<Heading1 size={12} />}
          label="H1"
          title="Heading 1"
          isActive={activeBlocks.heading1}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          variant="block"
        />
        <FormatBadge
          icon={<Heading2 size={12} />}
          label="H2"
          title="Heading 2"
          isActive={activeBlocks.heading2}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          variant="block"
        />
        <FormatBadge
          icon={<Heading3 size={12} />}
          label="H3"
          title="Heading 3"
          isActive={activeBlocks.heading3}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          variant="block"
        />
        <FormatBadge
          icon={<Quote size={12} />}
          label="Quote"
          title="Blockquote"
          isActive={activeBlocks.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          variant="block"
        />
        <FormatBadge
          icon={<FileCode size={12} />}
          label="Code"
          title="Code Block"
          isActive={activeBlocks.codeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          variant="block"
        />
        <FormatBadge
          icon={<List size={12} />}
          label="List"
          title="Bullet List"
          isActive={activeBlocks.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          variant="block"
        />
        <FormatBadge
          icon={<ListOrdered size={12} />}
          label="Numbered"
          title="Ordered List"
          isActive={activeBlocks.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          variant="block"
        />
        <FormatBadge
          icon={<CheckSquare size={12} />}
          label="Tasks"
          title="Task List"
          isActive={activeBlocks.taskList}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          variant="block"
        />

        {/* Separator between blocks and marks if both exist */}
        {hasAnyBlocks && hasAnyMarks && (
          <div className="w-px h-4 bg-neutral-300 mx-1" />
        )}

        {/* Standard marks (gray badges) */}
        <FormatBadge
          icon={<Bold size={12} />}
          title="Bold"
          isActive={activeMarks.bold}
          onClick={() => removeMarkSmart("bold")}
        />
        <FormatBadge
          icon={<Italic size={12} />}
          title="Italic"
          isActive={activeMarks.italic}
          onClick={() => removeMarkSmart("italic")}
        />
        <FormatBadge
          icon={<Underline size={12} />}
          title="Underline"
          isActive={activeMarks.underline}
          onClick={() => removeMarkSmart("underline")}
        />
        <FormatBadge
          icon={<Strikethrough size={12} />}
          title="Strikethrough"
          isActive={activeMarks.strike}
          onClick={() => removeMarkSmart("strike")}
        />
        <FormatBadge
          icon={<Highlighter size={12} />}
          title="Highlight"
          isActive={activeMarks.highlight}
          onClick={() => removeMarkSmart("highlight")}
        />
        <FormatBadge
          icon={<Link size={12} />}
          title="Link"
          isActive={activeMarks.link}
          onClick={() => {
            if (isEmptySelection()) {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
            } else {
              editor.chain().focus().unsetLink().run();
            }
          }}
        />
        <FormatBadge
          icon={<Code size={12} />}
          title="Code"
          isActive={activeMarks.code}
          onClick={() => removeMarkSmart("code")}
        />
        <FormatBadge
          icon={<Subscript size={12} />}
          title="Subscript"
          isActive={activeMarks.subscript}
          onClick={() => removeMarkSmart("subscript")}
        />
        <FormatBadge
          icon={<Superscript size={12} />}
          title="Superscript"
          isActive={activeMarks.superscript}
          onClick={() => removeMarkSmart("superscript")}
        />

        {/* Separator before inline styles if they exist */}
        {(hasAnyMarks || hasAnyBlocks) && inlineStyles.length > 0 && (
          <div className="w-px h-4 bg-neutral-300 mx-1" />
        )}

        {/* Detected inline styles (amber badges) */}
        {inlineStyles.map((style, index) => (
          <FormatBadge
            key={`${style.type}-${index}`}
            label={style.label}
            title={style.label}
            isActive={true}
            onClick={removeInlineStyles}
            variant="style"
          />
        ))}

        {/* Separator and Clear All button */}
        {hasAnyFormatting && (
          <>
            <div className="w-px h-4 bg-neutral-300 mx-1" />
            <button
              onClick={() => {
                // Clear all marks first (smart - extends if cursor)
                if (isEmptySelection()) {
                  // For cursor, clear the current node's marks
                  const { $from } = editor.state.selection;
                  const from = $from.start();
                  const to = $from.end();
                  editor.chain()
                    .focus()
                    .setTextSelection({ from, to })
                    .unsetAllMarks()
                    .run();
                } else {
                  editor.chain().focus().unsetAllMarks().run();
                }
                // Clear block formatting
                editor.chain().focus().clearNodes().run();
                // Then remove inline styles if any
                if (inlineStyles.length > 0) {
                  removeInlineStyles();
                }
              }}
              title="Clear All Formatting"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium
                bg-red-100 text-red-700 hover:bg-red-200 transition-colors cursor-pointer"
            >
              <X size={12} />
              <span>Clear All</span>
            </button>
          </>
        )}
      </div>
    </BubbleMenu>
  );
};

export default FormatInspector;
