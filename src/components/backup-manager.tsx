// src/components/backup-manager.tsx
"use client";

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import DOMPurify from "dompurify";
import { useNotesBackup } from "@/utils/notes-backup";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  IconDownload,
  IconTrash,
  IconRefresh,
  IconCloud,
  IconDeviceDesktop,
  IconRestore,
  IconShield,
  IconClock,
} from "@tabler/icons-react";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

interface BackupEntry {
  id: string;
  noteId: string;
  noteSource: "local" | "cloud";
  timestamp: number;
  title: string;
  changeType: "create" | "update" | "delete";
  metadata?: {
    wordCount?: number;
    charCount?: number;
    isPinned?: boolean;
    isPrivate?: boolean;
  };
}

interface PreviewContent {
  content: string;
  title: string;
}

export default function BackupManager({
  onRestoreNote,
}: {
  onRestoreNote?: (note: any) => Promise<void> | void;
}) {
  const {
    backupStats,
    loadBackupStats,
    getAllBackups,
    getBackupsForNote,
    restoreFromBackup,
    deleteAllBackups,
    exportBackups,
    isBackingUp,
    getReadableBackupContent,
  } = useNotesBackup(onRestoreNote);

  const { showSuccess, showError, showWarning } = useToast();

  // Consolidated state
  const [state, setState] = useState({
    allBackups: [] as BackupEntry[],
    selectedNoteBackups: [] as BackupEntry[],
    selectedNoteId: "",
    isLoading: false,
    previewContent: null as PreviewContent | null,
    showPreview: false,
    showDeleteConfirm: false,
    restoreBackupId: null as string | null,
    showRestoreConfirm: false,
  });

  // Memoized unique notes - prevents recalculation on every render
  const uniqueNotes = useMemo(() => {
    const notesMap = new Map<string, BackupEntry>();
    state.allBackups.forEach((backup) => {
      if (!notesMap.has(backup.noteId)) {
        notesMap.set(backup.noteId, backup);
      }
    });
    return Array.from(notesMap.values());
  }, [state.allBackups]);

  // Memoized date formatter
  const formatDate = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  }, []);

  // Load all backups
  const loadAllBackups = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const backups = await getAllBackups();
      setState((prev) => ({ ...prev, allBackups: backups }));
    } catch (error) {
      console.error("Failed to load backups:", error);
      showError("Failed to load backups");
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [getAllBackups, showError]);

  // Load note-specific backups
  const loadNoteBackups = useCallback(
    async (noteId: string) => {
      if (!noteId) return;

      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const backups = await getBackupsForNote(noteId, 20);
        setState((prev) => ({ ...prev, selectedNoteBackups: backups }));
      } catch (error) {
        console.error("Failed to load note backups:", error);
        showError("Failed to load note backups");
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [getBackupsForNote, showError],
  );

  // Handle restore with confirmation
  const handleRestoreClick = useCallback((backupId: string) => {
    setState((prev) => ({
      ...prev,
      restoreBackupId: backupId,
      showRestoreConfirm: true,
    }));
  }, []);

  const handleRestoreConfirm = useCallback(async () => {
    const backupId = state.restoreBackupId;
    if (!backupId) return;

    try {
      const result = await restoreFromBackup(backupId);
      if (result.success && result.note) {
        showSuccess(
          `Note "${result.note.title}" restored successfully! The note content has been updated.`,
        );
        // Refresh the backup list
        await loadAllBackups();
        if (state.selectedNoteId) {
          await loadNoteBackups(state.selectedNoteId);
        }
      } else {
        showError(result.error || "Failed to restore note");
      }
    } catch (error) {
      console.error("Restore failed:", error);
      showError("Failed to restore note due to an unexpected error");
    } finally {
      setState((prev) => ({
        ...prev,
        restoreBackupId: null,
        showRestoreConfirm: false,
      }));
    }
  }, [
    state.restoreBackupId,
    state.selectedNoteId,
    restoreFromBackup,
    loadAllBackups,
    loadNoteBackups,
    showSuccess,
    showError,
  ]);

  const handleRestoreCancel = useCallback(() => {
    setState((prev) => ({
      ...prev,
      restoreBackupId: null,
      showRestoreConfirm: false,
    }));
  }, []);

  // Handle preview
  const handlePreview = useCallback(
    async (backupId: string) => {
      try {
        const content = await getReadableBackupContent(backupId);
        if (content) {
          setState((prev) => ({
            ...prev,
            previewContent: {
              content: content.content,
              title: content.fullNote.title,
            },
            showPreview: true,
          }));
        } else {
          showError("Failed to load backup content");
        }
      } catch (error) {
        console.error("Preview failed:", error);
        showError("Failed to preview backup content");
      }
    },
    [getReadableBackupContent, showError],
  );

  const handleClosePreview = useCallback(() => {
    setState((prev) => ({ ...prev, showPreview: false, previewContent: null }));
  }, []);

  // Handle export
  const handleExport = useCallback(async () => {
    try {
      const exportData = await exportBackups();
      const blob = new Blob([exportData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `notes-backup-${
        new Date().toISOString().split("T")[0]
      }.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showSuccess(
        "Backup exported successfully! The file contains all your notes in readable format.",
      );
    } catch (error) {
      console.error("Export failed:", error);
      showError("Failed to export backups");
    }
  }, [exportBackups, showSuccess, showError]);

  // Handle delete all
  const handleDeleteAllClick = useCallback(() => {
    setState((prev) => ({ ...prev, showDeleteConfirm: true }));
  }, []);

  const handleDeleteAllConfirm = useCallback(async () => {
    try {
      await deleteAllBackups();
      await loadBackupStats();
      await loadAllBackups();
      showSuccess("All backups deleted successfully");
    } catch (error) {
      console.error("Delete failed:", error);
      showError("Failed to delete backups");
    } finally {
      setState((prev) => ({ ...prev, showDeleteConfirm: false }));
    }
  }, [
    deleteAllBackups,
    loadBackupStats,
    loadAllBackups,
    showSuccess,
    showError,
  ]);

  const handleDeleteAllCancel = useCallback(() => {
    setState((prev) => ({ ...prev, showDeleteConfirm: false }));
  }, []);

  // Handle note selection change
  const handleNoteSelect = useCallback((noteId: string) => {
    setState((prev) => ({ ...prev, selectedNoteId: noteId }));
  }, []);

  // Initial load
  useEffect(() => {
    loadBackupStats();
    loadAllBackups();
  }, [loadBackupStats, loadAllBackups]);

  // Load note backups when selection changes
  useEffect(() => {
    if (state.selectedNoteId) {
      loadNoteBackups(state.selectedNoteId);
    }
  }, [state.selectedNoteId, loadNoteBackups]);

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-6">
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconShield className="h-6 w-6" />
            Notes Backup Manager
          </CardTitle>
          <CardDescription>
            Your notes are automatically encrypted and backed up locally. The
            last 50 changes for each note are preserved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Stats Grid */}
          {backupStats && <BackupStatsGrid backupStats={backupStats} />}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Button
              onClick={loadBackupStats}
              disabled={state.isLoading}
              variant="outline"
            >
              <IconRefresh className="h-4 w-4 mr-2" />
              Refresh Stats
            </Button>
            <Button onClick={handleExport} variant="outline">
              <IconDownload className="h-4 w-4 mr-2" />
              Export Backups
            </Button>
            <Button
              onClick={handleDeleteAllClick}
              className="bg-red-600"
              variant="destructive"
            >
              <IconTrash className="h-4 w-4 mr-2" />
              Delete All
            </Button>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="by-note">By Note</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <BackupOverviewTab
                uniqueNotes={uniqueNotes}
                formatDate={formatDate}
                onSelectNote={handleNoteSelect}
              />
            </TabsContent>

            <TabsContent value="by-note" className="space-y-4">
              <BackupByNoteTab
                uniqueNotes={uniqueNotes}
                selectedNoteId={state.selectedNoteId}
                selectedNoteBackups={state.selectedNoteBackups}
                formatDate={formatDate}
                onNoteSelect={handleNoteSelect}
                onPreview={handlePreview}
                onRestore={handleRestoreClick}
              />
            </TabsContent>

            <TabsContent value="timeline" className="space-y-4">
              <BackupTimelineTab
                allBackups={state.allBackups}
                formatDate={formatDate}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Info Card */}
      <BackupInfoCard />

      {/* Preview Modal */}
      {state.showPreview && state.previewContent && (
        <BackupPreviewModal
          isOpen={state.showPreview}
          content={state.previewContent}
          onClose={handleClosePreview}
        />
      )}

      {/* Delete All Confirmation */}
      <ConfirmModal
        isOpen={state.showDeleteConfirm}
        onClose={handleDeleteAllCancel}
        onConfirm={handleDeleteAllConfirm}
        title="Delete All Backups"
        message="Are you sure you want to delete all backups? This cannot be undone."
        confirmText="Delete All"
        isDestructive={true}
      />

      {/* Restore Confirmation */}
      <ConfirmModal
        isOpen={state.showRestoreConfirm}
        onClose={handleRestoreCancel}
        onConfirm={handleRestoreConfirm}
        title="Restore Backup"
        message="Are you sure you want to restore this version? This will replace the current note content."
        confirmText="Restore"
      />

      {/* Backing up indicator */}
      {isBackingUp && (
        <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Backing up...
          </div>
        </div>
      )}
    </div>
  );
}

// Extracted Sub-Components

function BackupStatsGrid({ backupStats }: { backupStats: any }) {
  const stats = useMemo(
    () => [
      {
        value: backupStats.totalBackups,
        label: "Total Backups",
        color: "blue",
      },
      {
        value: backupStats.localBackups,
        label: "Local Notes",
        color: "orange",
      },
      {
        value: backupStats.cloudBackups,
        label: "Cloud Notes",
        color: "green",
      },
      {
        value: backupStats.oldestBackup
          ? Math.ceil(
              (Date.now() - backupStats.oldestBackup.getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : 0,
        label: "Days of History",
        color: "purple",
      },
    ],
    [backupStats],
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {stats.map((stat, index) => (
        <div
          key={index}
          className={`text-center p-4 bg-${stat.color}-50 rounded-lg`}
        >
          <div className={`text-2xl font-bold text-${stat.color}-600`}>
            {stat.value}
          </div>
          <div className={`text-sm text-${stat.color}-600`}>{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

const BackupOverviewTab = memo(function BackupOverviewTab({
  uniqueNotes,
  formatDate,
  onSelectNote,
}: {
  uniqueNotes: BackupEntry[];
  formatDate: (timestamp: number) => string;
  onSelectNote: (noteId: string) => void;
}) {
  return (
    <div className="grid gap-4">
      {uniqueNotes.map((backup) => (
        <Card key={backup.noteId} className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {backup.noteSource === "cloud" ? (
                <IconCloud className="h-5 w-5 text-blue-500" />
              ) : (
                <IconDeviceDesktop className="h-5 w-5 text-orange-500" />
              )}
              <div>
                <h3 className="font-medium">{backup.title}</h3>
                <p className="text-sm text-gray-500">
                  {backup.metadata?.wordCount || 0} words • Last backup:{" "}
                  {formatDate(backup.timestamp)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {backup.metadata?.isPinned && (
                <Badge variant="secondary">Pinned</Badge>
              )}
              {backup.metadata?.isPrivate && (
                <Badge variant="outline">Private</Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSelectNote(backup.noteId)}
              >
                View History
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
});

const BackupByNoteTab = memo(function BackupByNoteTab({
  uniqueNotes,
  selectedNoteId,
  selectedNoteBackups,
  formatDate,
  onNoteSelect,
  onPreview,
  onRestore,
}: {
  uniqueNotes: BackupEntry[];
  selectedNoteId: string;
  selectedNoteBackups: BackupEntry[];
  formatDate: (timestamp: number) => string;
  onNoteSelect: (noteId: string) => void;
  onPreview: (backupId: string) => void;
  onRestore: (backupId: string) => void;
}) {
  return (
    <>
      <div className="flex gap-2 mb-4">
        <select
          value={selectedNoteId}
          onChange={(e) => onNoteSelect(e.target.value)}
          className="px-3 py-2 border rounded-md"
        >
          <option value="">Select a note to view its history...</option>
          {uniqueNotes.map((backup) => (
            <option key={backup.noteId} value={backup.noteId}>
              {backup.title}
            </option>
          ))}
        </select>
      </div>

      {selectedNoteBackups.length > 0 && (
        <ScrollArea className="h-96">
          <div className="space-y-2">
            {selectedNoteBackups.map((backup) => (
              <Card key={backup.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <IconClock className="h-4 w-4 text-gray-400" />
                    <div>
                      <div className="font-medium">
                        {formatDate(backup.timestamp)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {backup.changeType} • {backup.metadata?.wordCount || 0}{" "}
                        words
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onPreview(backup.id)}
                    >
                      👁️ Preview
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRestore(backup.id)}
                    >
                      <IconRestore className="h-4 w-4 mr-1" />
                      Restore
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </>
  );
});

const BackupTimelineTab = memo(function BackupTimelineTab({
  allBackups,
  formatDate,
}: {
  allBackups: BackupEntry[];
  formatDate: (timestamp: number) => string;
}) {
  return (
    <ScrollArea className="h-96">
      <div className="space-y-2">
        {allBackups.slice(0, 50).map((backup) => (
          <Card key={backup.id} className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {backup.noteSource === "cloud" ? (
                  <IconCloud className="h-4 w-4 text-blue-500" />
                ) : (
                  <IconDeviceDesktop className="h-4 w-4 text-orange-500" />
                )}
                <div>
                  <div className="font-medium">{backup.title}</div>
                  <div className="text-sm text-gray-500">
                    {formatDate(backup.timestamp)} • {backup.changeType}
                  </div>
                </div>
              </div>
              <Badge
                variant={
                  backup.changeType === "create"
                    ? "default"
                    : backup.changeType === "update"
                      ? "secondary"
                      : "destructive"
                }
              >
                {backup.changeType}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
});

function BackupInfoCard() {
  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>📋 What do these features do?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-800 mb-2">🔄 Restore</h3>
            <p className="text-sm text-blue-700">
              Replaces your current note content with the selected backup
              version. This actually updates the note in your active notes list.
            </p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <h3 className="font-semibold text-green-800 mb-2">
              📖 View History
            </h3>
            <p className="text-sm text-green-700">
              Shows all saved versions of a specific note over time. You can see
              when changes were made and preview the content.
            </p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <h3 className="font-semibold text-purple-800 mb-2">📤 Export</h3>
            <p className="text-sm text-purple-700">
              Downloads a JSON file with all your notes in readable format.
              Perfect for backing up to cloud storage or transferring devices.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BackupPreviewModal({
  isOpen,
  content,
  onClose,
}: {
  isOpen: boolean;
  content: PreviewContent;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Preview: ${content.title}`}
      size="xl"
      className="max-h-[80vh]"
    >
      <div className="overflow-auto max-h-[60vh]">
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content.content) }}
        />
      </div>
    </Modal>
  );
}
