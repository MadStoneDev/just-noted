"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { TAG_COLORS } from "@/types/tag";
import {
  createTag,
  assignTagToNote,
  removeTagFromNote,
} from "@/app/actions/tagActions";
import { IconTag, IconPlus, IconCheck, IconX } from "@tabler/icons-react";

interface TagPickerProps {
  noteId: string;
}

export default function TagPicker({ noteId }: TagPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[6]);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = useNotesStore((s) => s.tags);
  const noteTagMap = useNotesStore((s) => s.noteTagMap);
  const addTagToStore = useNotesStore((s) => s.addTag);
  const assignInStore = useNotesStore((s) => s.assignTagToNoteInStore);
  const removeInStore = useNotesStore((s) => s.removeTagFromNoteInStore);

  const assignedTagIds = noteTagMap[noteId] || [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isCreating && inputRef.current) inputRef.current.focus();
  }, [isCreating]);

  const handleToggleTag = async (tagId: string) => {
    const isAssigned = assignedTagIds.includes(tagId);
    if (isAssigned) {
      removeInStore(noteId, tagId);
      await removeTagFromNote(noteId, tagId);
    } else {
      assignInStore(noteId, tagId);
      await assignTagToNote(noteId, tagId);
    }
  };

  const handleCreateTag = async () => {
    const name = newName.trim();
    if (!name) return;
    const result = await createTag({ name, color: newColor });
    if (result.success && result.tag) {
      addTagToStore(result.tag);
      assignInStore(noteId, result.tag.id);
      await assignTagToNote(noteId, result.tag.id);
      setNewName("");
      setIsCreating(false);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors duration-[var(--duration-fast)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
        title="Tags"
      >
        <IconTag size={16} />
        {assignedTagIds.length > 0 && (
          <span className="text-[10px] font-medium">{assignedTagIds.length}</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-[var(--color-bg-elevated)] border border-[var(--color-border-secondary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] z-50 overflow-hidden">
          <div className="p-2 max-h-60 overflow-y-auto">
            {tags.length === 0 && !isCreating && (
              <p className="text-xs text-[var(--color-text-tertiary)] px-2 py-3 text-center">
                No tags yet
              </p>
            )}

            {tags.map((tag) => {
              const isAssigned = assignedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => handleToggleTag(tag.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors text-left text-xs"
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="flex-1 text-[var(--color-text-secondary)] truncate">
                    {tag.name}
                  </span>
                  {isAssigned && (
                    <IconCheck size={14} className="text-[var(--color-accent)] flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {isCreating ? (
            <div className="border-t border-[var(--color-border-secondary)] p-2">
              <div className="flex items-center gap-1.5 mb-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateTag();
                    if (e.key === "Escape") {
                      setIsCreating(false);
                      setNewName("");
                    }
                  }}
                  placeholder="Tag name"
                  maxLength={50}
                  className="flex-1 min-w-0 text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border border-[var(--color-border-secondary)] outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
                <button
                  onClick={handleCreateTag}
                  className="p-1 rounded-[var(--radius-sm)] text-[var(--color-accent)] hover:bg-[var(--color-hover)]"
                >
                  <IconCheck size={14} />
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setNewName("");
                  }}
                  className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover)]"
                >
                  <IconX size={14} />
                </button>
              </div>
              <div className="flex gap-1 flex-wrap">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className="w-5 h-5 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: color,
                      borderColor: newColor === color ? "var(--color-text-primary)" : "transparent",
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="border-t border-[var(--color-border-secondary)] p-1.5">
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors text-xs text-[var(--color-text-tertiary)]"
              >
                <IconPlus size={14} />
                Create new tag
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
