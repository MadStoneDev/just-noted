"use client";

import React, { useCallback, useMemo } from "react";
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
  variant?: "mark" | "style";
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

  return (
    <button
      onClick={onClick}
      title={`Remove ${title}`}
      className={`
        flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium
        transition-colors cursor-pointer
        ${
          variant === "style"
            ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
            : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
        }
      `}
    >
      {icon}
      {label && <span>{label}</span>}
      <X size={10} className="ml-0.5 opacity-60" />
    </button>
  );
};

const FormatInspector: React.FC<FormatInspectorProps> = ({ editor }) => {
  // Detect inline styles from DOM elements in selection
  const detectInlineStyles = useCallback((): DetectedStyle[] => {
    const { view, state } = editor;
    const { from, to, empty } = state.selection;

    if (empty) return [];

    const styles: DetectedStyle[] = [];
    const seenStyles = new Set<string>();

    try {
      // Walk through the selection range
      state.doc.nodesBetween(from, to, (node, pos) => {
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

  // Remove inline styles by replacing selection content
  const removeInlineStyles = useCallback(() => {
    const { state } = editor;
    const { from, to, empty } = state.selection;

    if (empty) return;

    // Get plain text content
    const text = state.doc.textBetween(from, to, " ");

    // Replace with plain text (removes all marks and styles)
    editor
      .chain()
      .focus()
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
  }, [
    editor,
    editor.state.selection,
  ]);

  const inlineStyles = detectInlineStyles();
  const hasAnyFormatting =
    Object.values(activeMarks).some(Boolean) || inlineStyles.length > 0;

  // Don't show if no formatting detected
  if (!hasAnyFormatting) {
    return (
      <BubbleMenu
        editor={editor}
        tippyOptions={{
          duration: 100,
          placement: "top",
        }}
        shouldShow={({ editor, state }) => {
          const { from, to } = state.selection;
          return from !== to;
        }}
      >
        <div className="bg-white rounded-lg shadow-lg border border-neutral-200 px-2 py-1.5 text-xs text-neutral-500">
          No formatting
        </div>
      </BubbleMenu>
    );
  }

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 100,
        placement: "top",
        maxWidth: 400,
      }}
      shouldShow={({ editor, state }) => {
        const { from, to } = state.selection;
        return from !== to;
      }}
    >
      <div className="bg-white rounded-lg shadow-lg border border-neutral-200 px-2 py-1.5 flex items-center gap-1 flex-wrap max-w-[380px]">
        {/* Standard marks */}
        <FormatBadge
          icon={<Bold size={12} />}
          title="Bold"
          isActive={activeMarks.bold}
          onClick={() => editor.chain().focus().unsetMark("bold").run()}
        />
        <FormatBadge
          icon={<Italic size={12} />}
          title="Italic"
          isActive={activeMarks.italic}
          onClick={() => editor.chain().focus().unsetMark("italic").run()}
        />
        <FormatBadge
          icon={<Underline size={12} />}
          title="Underline"
          isActive={activeMarks.underline}
          onClick={() => editor.chain().focus().unsetMark("underline").run()}
        />
        <FormatBadge
          icon={<Strikethrough size={12} />}
          title="Strikethrough"
          isActive={activeMarks.strike}
          onClick={() => editor.chain().focus().unsetMark("strike").run()}
        />
        <FormatBadge
          icon={<Highlighter size={12} />}
          title="Highlight"
          isActive={activeMarks.highlight}
          onClick={() => editor.chain().focus().unsetMark("highlight").run()}
        />
        <FormatBadge
          icon={<Link size={12} />}
          title="Link"
          isActive={activeMarks.link}
          onClick={() => editor.chain().focus().unsetLink().run()}
        />
        <FormatBadge
          icon={<Code size={12} />}
          title="Code"
          isActive={activeMarks.code}
          onClick={() => editor.chain().focus().unsetMark("code").run()}
        />
        <FormatBadge
          icon={<Subscript size={12} />}
          title="Subscript"
          isActive={activeMarks.subscript}
          onClick={() => editor.chain().focus().unsetMark("subscript").run()}
        />
        <FormatBadge
          icon={<Superscript size={12} />}
          title="Superscript"
          isActive={activeMarks.superscript}
          onClick={() => editor.chain().focus().unsetMark("superscript").run()}
        />

        {/* Detected inline styles */}
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
                // Clear all marks first
                editor.chain().focus().unsetAllMarks().run();
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
