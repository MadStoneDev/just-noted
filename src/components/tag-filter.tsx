"use client";

import React from "react";
import { useNotesStore } from "@/stores/notes-store";

export default function TagFilter() {
  const tags = useNotesStore((s) => s.tags);
  const filterTagIds = useNotesStore((s) => s.filterTagIds);
  const setFilterTagIds = useNotesStore((s) => s.setFilterTagIds);

  if (tags.length === 0) return null;

  const toggleTag = (tagId: string) => {
    if (filterTagIds.includes(tagId)) {
      setFilterTagIds(filterTagIds.filter((id) => id !== tagId));
    } else {
      setFilterTagIds([...filterTagIds, tagId]);
    }
  };

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => {
        const active = filterTagIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            onClick={() => toggleTag(tag.id)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-[var(--duration-fast)] border ${
              active
                ? "border-current"
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
            style={{
              backgroundColor: tag.color + (active ? "30" : "18"),
              color: tag.color,
            }}
          >
            {tag.name}
          </button>
        );
      })}
      {filterTagIds.length > 0 && (
        <button
          onClick={() => setFilterTagIds([])}
          className="px-2 py-0.5 rounded-full text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}
