"use client";

import { useState, useEffect } from "react";
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

  const [allBackups, setAllBackups] = useState<BackupEntry[]>([]);
  const [selectedNoteBackups, setSelectedNoteBackups] = useState<BackupEntry[]>(
    [],
  );
  const [selectedNoteId, setSelectedNoteId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState<{
    content: string;
    title: string;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const loadAllBackups = async () => {
    setIsLoading(true);
    try {
      const backups = await getAllBackups();
      setAllBackups(backups);
    } catch (error) {
      console.error("Failed to load backups:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadNoteBackups = async (noteId: string) => {
    if (!noteId) return;

    setIsLoading(true);
    try {
      const backups = await getBackupsForNote(noteId, 20);
      setSelectedNoteBackups(backups);
    } catch (error) {
      console.error("Failed to load note backups:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (backupId: string) => {
    if (
      !confirm(
        "Are you sure you want to restore this version? This will replace the current note content.",
      )
    ) {
      return;
    }

    try {
      const result = await restoreFromBackup(backupId);
      if (result.success && result.note) {
        alert(
          `✅ Note "${result.note.title}" restored successfully!\n\nThe note content has been updated to the selected backup version.`,
        );
        // Refresh the backup list
        await loadAllBackups();
        if (selectedNoteId) {
          await loadNoteBackups(selectedNoteId);
        }
      } else {
        alert(`❌ Failed to restore note: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Restore failed:", error);
      alert("❌ Failed to restore note due to an unexpected error");
    }
  };

  const handlePreview = async (backupId: string) => {
    try {
      const content = await getReadableBackupContent(backupId);
      if (content) {
        setPreviewContent({
          content: content.content,
          title: content.fullNote.title,
        });
        setShowPreview(true);
      } else {
        alert("Failed to load backup content");
      }
    } catch (error) {
      console.error("Preview failed:", error);
      alert("Failed to preview backup content");
    }
  };

  const handleExport = async () => {
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

      alert(
        "✅ Backup exported successfully!\n\nThe exported file contains all your notes in readable format. You can open it with any text editor to view your note content and history.",
      );
    } catch (error) {
      console.error("Export failed:", error);
      alert("❌ Failed to export backups");
    }
  };

  const handleDeleteAll = async () => {
    if (
      confirm(
        "Are you sure you want to delete all backups? This cannot be undone.",
      )
    ) {
      try {
        await deleteAllBackups();
        await loadBackupStats();
        await loadAllBackups();
        alert("All backups deleted successfully");
      } catch (error) {
        console.error("Delete failed:", error);
        alert("Failed to delete backups");
      }
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getUniqueNotes = () => {
    const uniqueNotes = new Map();
    allBackups.forEach((backup) => {
      if (!uniqueNotes.has(backup.noteId)) {
        uniqueNotes.set(backup.noteId, backup);
      }
    });
    return Array.from(uniqueNotes.values());
  };

  useEffect(() => {
    loadBackupStats();
    loadAllBackups();
  }, []);

  useEffect(() => {
    if (selectedNoteId) {
      loadNoteBackups(selectedNoteId);
    }
  }, [selectedNoteId]);

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-6">
      <Card className={`bg-white`}>
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
          {backupStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {backupStats.totalBackups}
                </div>
                <div className="text-sm text-blue-600">Total Backups</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">
                  {backupStats.localBackups}
                </div>
                <div className="text-sm text-orange-600">Local Notes</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {backupStats.cloudBackups}
                </div>
                <div className="text-sm text-green-600">Cloud Notes</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {backupStats.oldestBackup
                    ? Math.ceil(
                        (Date.now() - backupStats.oldestBackup.getTime()) /
                          (1000 * 60 * 60 * 24),
                      )
                    : 0}
                </div>
                <div className="text-sm text-purple-600">Days of History</div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-6">
            <Button
              onClick={loadBackupStats}
              disabled={isLoading}
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
              onClick={handleDeleteAll}
              className={`bg-red-600`}
              variant="destructive"
            >
              <IconTrash className="h-4 w-4 mr-2" />
              Delete All
            </Button>
          </div>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="by-note">By Note</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4">
                {getUniqueNotes().map((backup) => (
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
                            {backup.metadata?.wordCount || 0} words • Last
                            backup: {formatDate(backup.timestamp)}
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
                          onClick={() => setSelectedNoteId(backup.noteId)}
                        >
                          View History
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="by-note" className="space-y-4">
              <div className="flex gap-2 mb-4">
                <select
                  value={selectedNoteId}
                  onChange={(e) => setSelectedNoteId(e.target.value)}
                  className="px-3 py-2 border rounded-md"
                >
                  <option value="">Select a note to view its history...</option>
                  {getUniqueNotes().map((backup) => (
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
                                {backup.changeType} •{" "}
                                {backup.metadata?.wordCount || 0} words
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePreview(backup.id)}
                            >
                              👁️ Preview
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRestore(backup.id)}
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
            </TabsContent>

            <TabsContent value="timeline" className="space-y-4">
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
                              {formatDate(backup.timestamp)} •{" "}
                              {backup.changeType}
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className={`bg-white`}>
        <CardHeader>
          <CardTitle>📋 What do these features do?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-800 mb-2">🔄 Restore</h3>
              <p className="text-sm text-blue-700">
                Replaces your current note content with the selected backup
                version. This actually updates the note in your active notes
                list.
              </p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <h3 className="font-semibold text-green-800 mb-2">
                📖 View History
              </h3>
              <p className="text-sm text-green-700">
                Shows all saved versions of a specific note over time. You can
                see when changes were made and preview the content.
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

      {showPreview && previewContent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl max-h-[80vh] w-full overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                Preview: {previewContent.title}
              </h3>
              <Button variant="outline" onClick={() => setShowPreview(false)}>
                ✕ Close
              </Button>
            </div>
            <div className="p-4 overflow-auto max-h-[60vh]">
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: previewContent.content }}
              />
            </div>
          </div>
        </div>
      )}

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
