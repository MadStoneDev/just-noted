"use client";

import React, { useState } from "react";
import { CombinedNote } from "@/types/combined-notes";
import {
  IconHistory,
  IconClock,
  IconArrowBackUp,
  IconEye,
  IconX,
  IconChevronRight,
} from "@tabler/icons-react";

export interface NoteVersion {
  id: string;
  noteId: string;
  content: string;
  title: string;
  createdAt: number;
  wordCount: number;
  changeDescription?: string;
}

interface VersionHistoryProps {
  note: CombinedNote;
  versions: NoteVersion[];
  onRestore: (version: NoteVersion) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export default function VersionHistory({
  note,
  versions,
  onRestore,
  onClose,
  isLoading = false,
}: VersionHistoryProps) {
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handlePreview = (version: NoteVersion) => {
    setSelectedVersion(version);
    setShowPreview(true);
  };

  const handleRestore = (version: NoteVersion) => {
    if (confirm(`Restore this version from ${formatDate(version.createdAt)}? Your current content will be replaced.`)) {
      onRestore(version);
      onClose();
    }
  };

  // Group versions by date
  const groupedVersions = versions.reduce((groups, version) => {
    const date = new Date(version.createdAt).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(version);
    return groups;
  }, {} as Record<string, NoteVersion[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <IconHistory size={20} className="text-mercedes-primary" />
            <h2 className="text-lg font-semibold">Version History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Version List */}
          <div className="w-1/2 border-r border-neutral-200 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-neutral-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-mercedes-primary mx-auto mb-2" />
                Loading versions...
              </div>
            ) : versions.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                <IconHistory size={40} className="mx-auto mb-2 opacity-50" />
                <p>No version history available yet.</p>
                <p className="text-sm mt-1">Versions are saved automatically as you edit.</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {Object.entries(groupedVersions).map(([date, dateVersions]) => (
                  <div key={date}>
                    <div className="px-4 py-2 bg-neutral-50 text-xs font-medium text-neutral-500 sticky top-0">
                      {new Date(date).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                    {dateVersions.map((version) => (
                      <button
                        key={version.id}
                        onClick={() => handlePreview(version)}
                        className={`w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors flex items-center gap-3 ${
                          selectedVersion?.id === version.id ? "bg-mercedes-primary/5" : ""
                        }`}
                      >
                        <div className="flex-shrink-0">
                          <IconClock size={16} className="text-neutral-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {formatTime(version.createdAt)}
                            </span>
                            <span className="text-xs text-neutral-400">
                              {version.wordCount} words
                            </span>
                          </div>
                          {version.changeDescription && (
                            <p className="text-xs text-neutral-500 truncate mt-0.5">
                              {version.changeDescription}
                            </p>
                          )}
                        </div>
                        <IconChevronRight size={16} className="text-neutral-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview Panel */}
          <div className="w-1/2 flex flex-col">
            {selectedVersion ? (
              <>
                <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      {formatDate(selectedVersion.createdAt)} at{" "}
                      {formatTime(selectedVersion.createdAt)}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {selectedVersion.wordCount} words
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestore(selectedVersion)}
                    className="px-3 py-1.5 bg-mercedes-primary text-white text-sm rounded-lg hover:bg-mercedes-primary/90 transition-colors flex items-center gap-1"
                  >
                    <IconArrowBackUp size={14} />
                    Restore
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <h3 className="text-lg font-semibold mb-2">{selectedVersion.title}</h3>
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: selectedVersion.content }}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-neutral-500">
                <div className="text-center">
                  <IconEye size={40} className="mx-auto mb-2 opacity-50" />
                  <p>Select a version to preview</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 text-xs text-neutral-500 text-center">
          Versions are automatically saved when significant changes are made.
        </div>
      </div>
    </div>
  );
}

// Hook for managing version history (stores in localStorage for now, can be backed by DB later)
export function useVersionHistory(noteId: string) {
  const STORAGE_KEY = `note_versions_${noteId}`;
  const MAX_VERSIONS = 50;

  const getVersions = (): NoteVersion[] => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const saveVersion = (note: CombinedNote, changeDescription?: string) => {
    const versions = getVersions();

    // Calculate word count
    const div = document.createElement("div");
    div.innerHTML = note.content;
    const text = div.textContent || div.innerText || "";
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    // Don't save if content is identical to last version
    if (versions.length > 0 && versions[0].content === note.content) {
      return;
    }

    const newVersion: NoteVersion = {
      id: `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      noteId: note.id,
      content: note.content,
      title: note.title,
      createdAt: Date.now(),
      wordCount,
      changeDescription,
    };

    const updatedVersions = [newVersion, ...versions].slice(0, MAX_VERSIONS);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedVersions));
    } catch (e) {
      // Storage might be full, try removing oldest versions
      const reducedVersions = updatedVersions.slice(0, MAX_VERSIONS / 2);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reducedVersions));
    }

    return newVersion;
  };

  const clearVersions = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  return {
    getVersions,
    saveVersion,
    clearVersions,
  };
}
