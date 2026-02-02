"use client";

import React, { useState, useRef } from "react";
import { CoverType } from "@/types/notebook";
import {
  COVER_COLORS,
  COVER_GRADIENTS,
  COVER_PHOTOS,
  getCoverStyle,
} from "@/lib/notebook-covers";
import { IconCheck, IconUpload, IconPhoto, IconAlertCircle } from "@tabler/icons-react";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type TabType = "colors" | "gradients" | "photos" | "upload";

interface NotebookCoverPickerProps {
  coverType: CoverType;
  coverValue: string;
  onSelect: (type: CoverType, value: string) => void;
  onFileSelect?: (file: File | null) => void; // For pending file selection
  pendingFile?: File | null; // File selected but not yet uploaded
}

export default function NotebookCoverPicker({
  coverType,
  coverValue,
  onSelect,
  onFileSelect,
  pendingFile,
}: NotebookCoverPickerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Create preview URL for pending file
  React.useEffect(() => {
    if (pendingFile) {
      const url = URL.createObjectURL(pendingFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [pendingFile]);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear previous errors
    setUploadError(null);

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("Please select a JPG, PNG, or WebP image.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      setUploadError(`File is too large (${sizeMB}MB). Maximum size is 2MB.`);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // File is valid - use deferred upload (select file for later upload on save)
    if (onFileSelect) {
      onFileSelect(file);
      onSelect("custom", "pending"); // Mark as custom with pending upload
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
          style={pendingFile && previewUrl ? { backgroundImage: `url(${previewUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : getCoverStyle(coverType, coverValue)}
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
            type="button"
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
            {/* Upload error message */}
            {uploadError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                <IconAlertCircle size={16} className="flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Current custom image (uploaded) */}
            {coverType === "custom" && coverValue && coverValue !== "pending" && (
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

            {/* Pending file preview (not yet uploaded) */}
            {pendingFile && previewUrl && (
              <div className="relative w-full h-20 rounded-lg overflow-hidden bg-neutral-100">
                <img
                  src={previewUrl}
                  alt="Selected cover"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 bg-amber-500 text-white p-1 rounded-full" title="Will upload on save">
                  <IconCheck size={12} />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-white text-xs py-1 text-center">
                  Ready to upload on save
                </div>
              </div>
            )}

            {/* Upload button */}
            <button
              type="button"
              onClick={() => {
                setUploadError(null);
                fileInputRef.current?.click();
              }}
              className="w-full flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-neutral-300 rounded-lg hover:border-mercedes-primary hover:bg-neutral-50 transition-colors"
            >
              <IconUpload size={24} className="text-neutral-400" />
              <span className="text-sm text-neutral-600">
                {pendingFile ? "Change image" : "Click to select image"}
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
          type="button"
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
          type="button"
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
            type="button"
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
