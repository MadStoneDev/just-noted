"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { IconX, IconPlus, IconTag } from "@tabler/icons-react";

// Predefined tag colors
const TAG_COLORS = [
  { name: "gray", bg: "bg-neutral-100", text: "text-neutral-700", border: "border-neutral-300" },
  { name: "red", bg: "bg-red-100", text: "text-red-700", border: "border-red-300" },
  { name: "orange", bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  { name: "yellow", bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-300" },
  { name: "green", bg: "bg-green-100", text: "text-green-700", border: "border-green-300" },
  { name: "teal", bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-300" },
  { name: "blue", bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-300" },
  { name: "purple", bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300" },
  { name: "pink", bg: "bg-pink-100", text: "text-pink-700", border: "border-pink-300" },
];

export interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TagsInputProps {
  tags: Tag[];
  availableTags?: Tag[];
  onAddTag: (tag: Tag) => void;
  onRemoveTag: (tagId: string) => void;
  onCreateTag?: (name: string, color: string) => Promise<Tag>;
  maxTags?: number;
  readOnly?: boolean;
  className?: string;
}

export default function TagsInput({
  tags,
  availableTags = [],
  onAddTag,
  onRemoveTag,
  onCreateTag,
  maxTags = 5,
  readOnly = false,
  className = "",
}: TagsInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0].name);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowColorPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter available tags based on input and already selected
  const filteredTags = availableTags.filter(
    (tag) =>
      !tags.some((t) => t.id === tag.id) &&
      tag.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const canAddMore = tags.length < maxTags;

  const handleAddExistingTag = useCallback(
    (tag: Tag) => {
      if (canAddMore) {
        onAddTag(tag);
        setInputValue("");
        setIsOpen(false);
      }
    },
    [canAddMore, onAddTag]
  );

  const handleCreateNewTag = useCallback(async () => {
    if (!inputValue.trim() || !onCreateTag || !canAddMore) return;

    const newTag = await onCreateTag(inputValue.trim(), selectedColor);
    onAddTag(newTag);
    setInputValue("");
    setIsOpen(false);
    setShowColorPicker(false);
  }, [inputValue, selectedColor, onCreateTag, onAddTag, canAddMore]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && inputValue.trim()) {
        e.preventDefault();
        if (filteredTags.length > 0) {
          handleAddExistingTag(filteredTags[0]);
        } else if (onCreateTag) {
          handleCreateNewTag();
        }
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    },
    [inputValue, filteredTags, handleAddExistingTag, handleCreateNewTag, onCreateTag]
  );

  const getColorClasses = (colorName: string) => {
    return TAG_COLORS.find((c) => c.name === colorName) || TAG_COLORS[0];
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Current Tags */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => {
          const colors = getColorClasses(tag.color);
          return (
            <span
              key={tag.id}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}
            >
              <IconTag size={12} />
              {tag.name}
              {!readOnly && (
                <button
                  onClick={() => onRemoveTag(tag.id)}
                  className="hover:bg-black/10 rounded-full p-0.5 transition-colors"
                >
                  <IconX size={10} />
                </button>
              )}
            </span>
          );
        })}

        {/* Add Tag Button */}
        {!readOnly && canAddMore && (
          <button
            onClick={() => {
              setIsOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <IconPlus size={12} />
            Add Tag
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !readOnly && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-neutral-200 w-64 z-50">
          {/* Search Input */}
          <div className="p-2 border-b border-neutral-100">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search or create tag..."
              className="w-full px-3 py-1.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-mercedes-primary"
            />
          </div>

          {/* Available Tags */}
          {filteredTags.length > 0 && (
            <div className="max-h-40 overflow-y-auto p-1">
              {filteredTags.slice(0, 10).map((tag) => {
                const colors = getColorClasses(tag.color);
                return (
                  <button
                    key={tag.id}
                    onClick={() => handleAddExistingTag(tag)}
                    className="w-full px-3 py-1.5 text-left hover:bg-neutral-50 rounded flex items-center gap-2 transition-colors"
                  >
                    <span
                      className={`w-3 h-3 rounded-full ${colors.bg} ${colors.border} border`}
                    />
                    <span className="text-sm">{tag.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Create New Tag */}
          {inputValue.trim() && onCreateTag && (
            <div className="p-2 border-t border-neutral-100">
              {!showColorPicker ? (
                <button
                  onClick={() => setShowColorPicker(true)}
                  className="w-full px-3 py-1.5 text-left text-sm text-mercedes-primary hover:bg-mercedes-primary/5 rounded flex items-center gap-2 transition-colors"
                >
                  <IconPlus size={14} />
                  Create "{inputValue.trim()}"
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-neutral-500">Select color:</div>
                  <div className="flex flex-wrap gap-1">
                    {TAG_COLORS.map((color) => (
                      <button
                        key={color.name}
                        onClick={() => setSelectedColor(color.name)}
                        className={`w-6 h-6 rounded-full ${color.bg} ${color.border} border-2 transition-transform ${
                          selectedColor === color.name
                            ? "ring-2 ring-mercedes-primary ring-offset-1 scale-110"
                            : "hover:scale-110"
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleCreateNewTag}
                    className="w-full px-3 py-1.5 bg-mercedes-primary text-white text-sm rounded-lg hover:bg-mercedes-primary/90 transition-colors"
                  >
                    Create Tag
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {filteredTags.length === 0 && !inputValue.trim() && (
            <div className="p-4 text-center text-sm text-neutral-500">
              {availableTags.length === 0
                ? "No tags yet. Type to create one."
                : "All tags are already added."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Simple tag display component (for read-only views)
export function TagBadge({ tag }: { tag: Tag }) {
  const colors =
    TAG_COLORS.find((c) => c.name === tag.color) || TAG_COLORS[0];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}
    >
      <IconTag size={12} />
      {tag.name}
    </span>
  );
}
