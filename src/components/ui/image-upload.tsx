"use client";

import React, { useState, useRef, useCallback } from "react";
import { IconPhoto, IconUpload, IconLink, IconX, IconLoader } from "@tabler/icons-react";

/**
 * Validates that an image URL is safe
 * Only allows http and https protocols, plus data: URIs for uploads
 */
function isValidImageUrl(url: string): boolean {
  // Allow data: URIs for uploaded images
  if (url.startsWith("data:image/")) {
    return true;
  }

  try {
    const parsed = new URL(url);
    // Only allow http and https for external images
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

interface ImageUploadProps {
  onInsertImage: (src: string, alt?: string) => void;
  onClose: () => void;
}

// Compress image before inserting (reduce file size for base64)
async function compressImage(file: File, maxWidth: number = 1200, quality: number = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        // Scale down if larger than maxWidth
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to base64 with compression
        const compressedBase64 = canvas.toDataURL("image/jpeg", quality);
        resolve(compressedBase64);
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function ImageUpload({ onInsertImage, onClose }: ImageUploadProps) {
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be smaller than 10MB");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const compressedImage = await compressImage(file);
      setPreview(compressedImage);
    } catch (err) {
      setError("Failed to process image");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleInsert = useCallback(() => {
    if (mode === "upload" && preview) {
      onInsertImage(preview, alt || "Uploaded image");
      onClose();
    } else if (mode === "url" && url.trim()) {
      // Validate URL to prevent javascript: and other dangerous protocols
      if (isValidImageUrl(url.trim())) {
        onInsertImage(url.trim(), alt || "");
        onClose();
      } else {
        setError("Invalid URL. Please enter a valid http or https image URL.");
      }
    }
  }, [mode, preview, url, alt, onInsertImage, onClose]);

  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (url.trim()) {
        handleInsert();
      }
    },
    [url, handleInsert]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <IconPhoto size={20} className="text-mercedes-primary" />
            <h2 className="text-lg font-semibold">Insert Image</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="p-4 border-b border-neutral-200">
          <div className="flex gap-2">
            <button
              onClick={() => setMode("upload")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                mode === "upload"
                  ? "bg-mercedes-primary text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              <IconUpload size={16} className="inline mr-2" />
              Upload
            </button>
            <button
              onClick={() => setMode("url")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                mode === "url"
                  ? "bg-mercedes-primary text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              <IconLink size={16} className="inline mr-2" />
              URL
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {mode === "upload" ? (
            <>
              {/* Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-mercedes-primary bg-mercedes-primary/5"
                    : "border-neutral-300 hover:border-neutral-400"
                }`}
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <IconLoader size={32} className="animate-spin text-mercedes-primary" />
                    <p className="text-sm text-neutral-500">Processing image...</p>
                  </div>
                ) : preview ? (
                  <div className="relative">
                    <img
                      src={preview}
                      alt="Preview"
                      className="max-h-48 mx-auto rounded-lg"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreview(null);
                      }}
                      className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-lg hover:bg-neutral-100"
                    >
                      <IconX size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <IconUpload size={32} className="mx-auto text-neutral-400 mb-2" />
                    <p className="text-sm text-neutral-600">
                      Drag and drop an image here, or click to select
                    </p>
                    <p className="text-xs text-neutral-400 mt-1">
                      Supports JPG, PNG, GIF (max 10MB)
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </>
          ) : (
            <form onSubmit={handleUrlSubmit}>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:border-mercedes-primary"
              />
            </form>
          )}

          {/* Alt Text */}
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">
              Alt Text (optional)
            </label>
            <input
              type="text"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Describe the image for accessibility"
              className="w-full px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:border-mercedes-primary"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={mode === "upload" ? !preview : !url.trim()}
            className="px-4 py-2 bg-mercedes-primary text-white rounded-lg hover:bg-mercedes-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Insert Image
          </button>
        </div>
      </div>
    </div>
  );
}
