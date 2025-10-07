// src/components/page-estimate-modal.tsx
"use client";

import React, { useCallback } from "react";
import { IconBook, IconLayoutCards } from "@tabler/icons-react";
import { Modal } from "@/components/ui/modal";

interface PageEstimateModalProps {
  isOpen: boolean;
  currentFormat: string;
  onFormatChange: (format: string) => void;
  onClose: () => void;
}

interface PageFormat {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const PAGE_FORMATS: PageFormat[] = [
  {
    id: "novel",
    name: "Novel",
    description: "Approximately 250 words per page",
    icon: <IconBook size={24} strokeWidth={1.5} />,
  },
  {
    id: "a4",
    name: "A4 Document",
    description: "Approximately 500 words per page (double-spaced)",
    icon: <IconLayoutCards size={24} strokeWidth={1.5} />,
  },
  {
    id: "a5",
    name: "A5 Document",
    description: "Approximately 300 words per page",
    icon: <IconLayoutCards size={24} strokeWidth={1.5} />,
  },
];

export default function PageEstimateModal({
  isOpen,
  currentFormat,
  onFormatChange,
  onClose,
}: PageEstimateModalProps) {
  const handleFormatSelect = useCallback(
    (format: string) => {
      onFormatChange(format);
    },
    [onFormatChange],
  );

  const handleApply = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Page Format" size="md">
      <p className="text-neutral-600 mb-4">
        Select a page format to estimate how many pages your content would fill:
      </p>

      <div className="space-y-3 mb-6">
        {PAGE_FORMATS.map((format) => (
          <FormatOption
            key={format.id}
            format={format}
            isSelected={currentFormat === format.id}
            onSelect={handleFormatSelect}
          />
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleApply}
          className="px-4 py-2 bg-mercedes-primary text-white rounded-lg hover:bg-mercedes-primary/90 transition-all duration-200"
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}

// Extracted sub-component for format option
const FormatOption = React.memo(function FormatOption({
  format,
  isSelected,
  onSelect,
}: {
  format: PageFormat;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(format.id);
  }, [format.id, onSelect]);

  return (
    <button
      onClick={handleClick}
      className={`w-full p-3 rounded-lg border cursor-pointer transition-all duration-200 text-left ${
        isSelected
          ? "border-mercedes-primary bg-mercedes-primary/5"
          : "border-neutral-300 hover:border-neutral-400"
      }`}
    >
      <div className="flex items-center">
        <div
          className={`mr-3 ${
            isSelected ? "text-mercedes-primary" : "text-neutral-500"
          }`}
        >
          {format.icon}
        </div>
        <div>
          <h4 className="font-medium">{format.name}</h4>
          <p className="text-sm text-neutral-500">{format.description}</p>
        </div>
      </div>
    </button>
  );
});
