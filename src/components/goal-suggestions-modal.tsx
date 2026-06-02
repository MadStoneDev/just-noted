"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ds/modal";
import { IconTarget } from "@tabler/icons-react";

interface GoalSuggestionsModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (value: number, type: "words" | "characters") => void;
}

interface Preset {
  label: string;
  min: number;
  max?: number;
  description?: string;
}

interface Category {
  name: string;
  presets: Preset[];
}

const WORD_CATEGORIES: Category[] = [
  {
    name: "Book Writing",
    presets: [
      { label: "Flash Fiction", min: 500, max: 1000 },
      { label: "Short Story", min: 1000, max: 7500 },
      { label: "Novella", min: 17500, max: 40000 },
      { label: "Novel", min: 50000, max: 100000 },
      { label: "Epic Novel", min: 100000, max: 150000 },
      { label: "Single Chapter", min: 3000, max: 5000 },
      { label: "NaNoWriMo", min: 50000, description: "November challenge" },
    ],
  },
  {
    name: "Blog & Articles",
    presets: [
      { label: "Quick Post", min: 300, max: 500 },
      { label: "Blog Post", min: 1000, max: 2000 },
      { label: "Long-form Article", min: 2500, max: 5000 },
      { label: "Pillar Content", min: 5000, max: 10000 },
      { label: "Newsletter", min: 500, max: 1000 },
      { label: "Essay", min: 1500, max: 3000 },
    ],
  },
  {
    name: "Social Media",
    presets: [
      { label: "Tweet / X Post", min: 40, max: 50 },
      { label: "LinkedIn Post", min: 150, max: 300 },
      { label: "Facebook Post", min: 40, max: 80 },
      { label: "Instagram Caption", min: 125, max: 150 },
      { label: "Reddit Post", min: 200, max: 500 },
    ],
  },
  {
    name: "Academic",
    presets: [
      { label: "Abstract", min: 150, max: 300 },
      { label: "Research Paper", min: 5000, max: 8000 },
      { label: "Thesis Chapter", min: 8000, max: 12000 },
      { label: "Dissertation", min: 80000, max: 100000 },
    ],
  },
  {
    name: "Professional",
    presets: [
      { label: "Email", min: 50, max: 200 },
      { label: "Cover Letter", min: 250, max: 400 },
      { label: "Press Release", min: 400, max: 600 },
      { label: "Executive Summary", min: 500, max: 1000 },
      { label: "Business Proposal", min: 2000, max: 5000 },
    ],
  },
];

const CHARACTER_CATEGORIES: Category[] = [
  {
    name: "Social Media",
    presets: [
      { label: "Tweet / X Post", min: 280 },
      { label: "Instagram Bio", min: 150 },
      { label: "Instagram Caption", min: 2200 },
      { label: "LinkedIn Summary", min: 2600 },
      { label: "TikTok Caption", min: 2200 },
      { label: "YouTube Title", min: 100 },
      { label: "YouTube Description", min: 5000 },
      { label: "Pinterest Pin", min: 500 },
    ],
  },
  {
    name: "Business Listings",
    presets: [
      { label: "Google Business Post", min: 1500 },
      { label: "Google Business Description", min: 750 },
      { label: "Yelp Review", min: 5000 },
    ],
  },
  {
    name: "SEO & Web",
    presets: [
      { label: "Meta Title", min: 60 },
      { label: "Meta Description", min: 160 },
      { label: "Alt Text", min: 125 },
      { label: "URL Slug", min: 75 },
      { label: "CTA Button", min: 30 },
    ],
  },
  {
    name: "Messaging",
    presets: [
      { label: "SMS", min: 160 },
      { label: "Push Notification", min: 120 },
      { label: "Email Subject Line", min: 60 },
      { label: "Slack Message", min: 4000 },
    ],
  },
];

export default function GoalSuggestionsModal({ open, onClose, onSelect }: GoalSuggestionsModalProps) {
  const [tab, setTab] = useState<"words" | "characters">("words");
  const [activeCategory, setActiveCategory] = useState(0);

  const categories = tab === "words" ? WORD_CATEGORIES : CHARACTER_CATEGORIES;
  const currentCategory = categories[activeCategory] || categories[0];

  return (
    <Modal open={open} onClose={onClose} title="Goal Suggestions" size="md">
      <div className="space-y-3">
        {/* Tabs */}
        <div className="flex gap-1 p-0.5 bg-[var(--color-bg-tertiary)] rounded-[var(--radius-md)]">
          <button
            onClick={() => { setTab("words"); setActiveCategory(0); }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-colors ${
              tab === "words"
                ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-xs"
                : "text-[var(--color-text-tertiary)]"
            }`}
          >
            Words
          </button>
          <button
            onClick={() => { setTab("characters"); setActiveCategory(0); }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-colors ${
              tab === "characters"
                ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-xs"
                : "text-[var(--color-text-tertiary)]"
            }`}
          >
            Characters
          </button>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-1">
          {categories.map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(i)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-colors ${
                i === activeCategory
                  ? "bg-[var(--color-accent)] text-[var(--color-text-on-accent)]"
                  : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-active)]"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Presets */}
        <div className="grid grid-cols-2 gap-1.5 max-h-[40vh] overflow-y-auto scrollbar-thin">
          {currentCategory.presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                onSelect(preset.max || preset.min, tab);
                onClose();
              }}
              className="text-left px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border-secondary)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] transition-colors group"
            >
              <p className="text-xs font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)]">
                {preset.label}
              </p>
              <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
                {preset.max
                  ? `${preset.min.toLocaleString()} – ${preset.max.toLocaleString()} ${tab}`
                  : `${preset.min.toLocaleString()} ${tab}`}
                {preset.description && ` · ${preset.description}`}
              </p>
            </button>
          ))}
        </div>

        <p className="text-[9px] text-[var(--color-text-tertiary)] opacity-60">
          Click a preset to set it as your goal. Uses the upper range when a range is shown.
        </p>
      </div>
    </Modal>
  );
}
