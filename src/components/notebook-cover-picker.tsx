"use client";

import React, { useState, useRef } from "react";
import { CoverType } from "@/types/notebook";
import {
  COVER_COLORS,
  COVER_GRADIENTS,
  COVER_PHOTOS,
  getCoverStyle,
} from "@/lib/notebook-covers";
import { IconCheck, IconUpload, IconLoader2, IconPhoto } from "@tabler/icons-react";

type TabType = "colors" | "gradients" | "photos" | "upload";

interface NotebookCoverPickerProps {
  coverType: CoverType;
  coverValue: string;
  onSelect: (type: CoverType, value: string) => void;
  onUpload?: (file: File) => Promise<string | null>;
  isUploading?: boolean;
}

export default function NotebookCoverPicker({
  coverType,
  coverValue,
  onSelect,
  onUpload,
  isUploading = false,
}: NotebookCoverPickerProps) {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    // Set initial tab based on current cover type
    if (coverType === "color") return "colors";
    if (coverType === "gradient") return "gradients";
    if (coverType === "photo") return "photos";
    if (coverType === "custom") return "upload";
    return "colors";
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const tabs: { id: TabType; label: string }[] = [
    { id: "colors", label: "Colors" },
    { id: "gradients", label: "Gradients" },
    { id: "photos", label: "Photos" },
    { id: "upload", label: "Upload" },
  ];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;

    const url = await onUpload(file);
    if (url) {
      onSelect("custom", url);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="relative">
        <div
          className="w-full h-24 rounded-lg overflow-hidden"
          style={getCoverStyle(coverType, coverValue)}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white/80 text-sm font-medium drop-shadow-md">
              Cover Preview
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "text-mercedes-primary border-b-2 border-mercedes-primary"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[140px]">
        {activeTab === "colors" && (
          <ColorPicker
            selectedValue={coverType === "color" ? coverValue : null}
            onSelect={(value) => onSelect("color", value)}
          />
        )}

        {activeTab === "gradients" && (
          <GradientPicker
            selectedValue={coverType === "gradient" ? coverValue : null}
            onSelect={(value) => onSelect("gradient", value)}
          />
        )}

        {activeTab === "photos" && (
          <PhotoPicker
            selectedValue={coverType === "photo" ? coverValue : null}
            onSelect={(value) => onSelect("photo", value)}
          />
        )}

        {activeTab === "upload" && (
          <div className="space-y-4">
            {/* Current custom image */}
            {coverType === "custom" && coverValue && (
              <div className="relative w-full h-20 rounded-lg overflow-hidden bg-neutral-100">
                <img
                  src={coverValue}
                  alt="Custom cover"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 bg-mercedes-primary text-white p-1 rounded-full">
                  <IconCheck size={12} />
                </div>
              </div>
            )}

            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-neutral-300 rounded-lg hover:border-mercedes-primary hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              {isUploading ? (
                <IconLoader2 size={24} className="text-neutral-400 animate-spin" />
              ) : (
                <IconUpload size={24} className="text-neutral-400" />
              )}
              <span className="text-sm text-neutral-600">
                {isUploading ? "Uploading..." : "Click to upload image"}
              </span>
              <span className="text-xs text-neutral-400">
                JPG, PNG or WebP, max 2MB
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Color picker grid
function ColorPicker({
  selectedValue,
  onSelect,
}: {
  selectedValue: string | null;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {COVER_COLORS.map((color) => (
        <button
          key={color}
          onClick={() => onSelect(color)}
          className={`w-8 h-8 rounded-lg transition-transform hover:scale-110 ${
            selectedValue === color ? "ring-2 ring-mercedes-primary ring-offset-2" : ""
          }`}
          style={{ backgroundColor: color }}
          title={color}
        >
          {selectedValue === color && (
            <IconCheck size={16} className="text-white mx-auto" />
          )}
        </button>
      ))}
    </div>
  );
}

// Gradient picker grid
function GradientPicker({
  selectedValue,
  onSelect,
}: {
  selectedValue: string | null;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {COVER_GRADIENTS.map((gradient) => (
        <button
          key={gradient.name}
          onClick={() => onSelect(gradient.value)}
          className={`h-12 rounded-lg transition-transform hover:scale-105 ${
            selectedValue === gradient.value
              ? "ring-2 ring-mercedes-primary ring-offset-2"
              : ""
          }`}
          style={{ background: gradient.value }}
          title={gradient.name}
        >
          {selectedValue === gradient.value && (
            <IconCheck size={16} className="text-white mx-auto" />
          )}
        </button>
      ))}
    </div>
  );
}

// Photo picker grid
function PhotoPicker({
  selectedValue,
  onSelect,
}: {
  selectedValue: string | null;
  onSelect: (value: string) => void;
}) {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  const handleImageError = (path: string) => {
    setImageErrors((prev) => new Set(prev).add(path));
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      {COVER_PHOTOS.map((photo) => {
        const hasError = imageErrors.has(photo.path);

        return (
          <button
            key={photo.name}
            onClick={() => onSelect(photo.path)}
            className={`h-16 rounded-lg overflow-hidden transition-transform hover:scale-105 bg-neutral-100 ${
              selectedValue === photo.path
                ? "ring-2 ring-mercedes-primary ring-offset-2"
                : ""
            }`}
            title={photo.name}
          >
            {hasError ? (
              <div className="w-full h-full flex items-center justify-center bg-neutral-200">
                <IconPhoto size={20} className="text-neutral-400" />
              </div>
            ) : (
              <img
                src={photo.path}
                alt={photo.name}
                className="w-full h-full object-cover"
                onError={() => handleImageError(photo.path)}
              />
            )}
            {selectedValue === photo.path && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <IconCheck size={16} className="text-white" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
