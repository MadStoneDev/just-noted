"use client";

import React from "react";

// Encryption utilities
const ENCRYPTION_KEY_NAME = "notes-backup-key";

// Generate or retrieve encryption key
async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  // Try to get existing key from IndexedDB
  const existingKey = await getStoredKey();
  if (existingKey) {
    return existingKey;
  }

  // Generate new key
  const key = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true, // extractable
    ["encrypt", "decrypt"],
  );

  // Store the key
  await storeKey(key);
  return key;
}

async function storeKey(key: CryptoKey): Promise<void> {
  const keyData = await crypto.subtle.exportKey("raw", key);
  localStorage.setItem(
    ENCRYPTION_KEY_NAME,
    btoa(String.fromCharCode(...new Uint8Array(keyData))),
  );
}

async function getStoredKey(): Promise<CryptoKey | null> {
  const keyString = localStorage.getItem(ENCRYPTION_KEY_NAME);
  if (!keyString) return null;

  try {
    const keyData = new Uint8Array(
      atob(keyString)
        .split("")
        .map((c) => c.charCodeAt(0)),
    );
    return await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"],
    );
  } catch (error) {
    console.error("Failed to import stored key:", error);
    return null;
  }
}

// Encrypt data
async function encryptData(
  data: string,
): Promise<{ encrypted: string; iv: string }> {
  const key = await getOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedData = new TextEncoder().encode(data);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedData,
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

// Decrypt data
async function decryptData(
  encryptedData: string,
  ivString: string,
): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const iv = new Uint8Array(
    atob(ivString)
      .split("")
      .map((c) => c.charCodeAt(0)),
  );
  const encrypted = new Uint8Array(
    atob(encryptedData)
      .split("")
      .map((c) => c.charCodeAt(0)),
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted,
  );

  return new TextDecoder().decode(decrypted);
}

// IndexedDB setup
const DB_NAME = "NotesBackupDB";
const DB_VERSION = 1;
const STORE_NAME = "backups";
const MAX_BACKUPS = 50;

interface BackupEntry {
  id: string;
  noteId: string;
  noteSource: "local" | "cloud";
  timestamp: number;
  encryptedContent: string;
  iv: string;
  title: string;
  changeType: "create" | "update" | "delete";
  metadata?: {
    wordCount?: number;
    charCount?: number;
    isPinned?: boolean;
    isPrivate?: boolean;
  };
}

interface CombinedNote {
  id: string;
  title: string;
  content: string;
  source: "redis" | "supabase";
  isPinned?: boolean;
  isPrivate?: boolean;
  goal?: number;
  goal_type?: string | "" | "words" | "characters";
  isCollapsed?: boolean;
  created_at?: string;
  updated_at?: string;
  // Add any other properties that exist in your actual CombinedNote type
}

// Add this interface for the restore callback
type RestoreCallback = (restoredNote: any) => Promise<void> | void;

// Update the NotesBackupManager class
class NotesBackupManager {
  private db: IDBDatabase | null = null;
  private restoreCallback: RestoreCallback | null = null;

  // Add method to set restore callback
  setRestoreCallback(callback: RestoreCallback) {
    this.restoreCallback = callback;
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("noteId", "noteId", { unique: false });
          store.createIndex("timestamp", "timestamp", { unique: false });
          store.createIndex("noteSource", "noteSource", { unique: false });
        }
      };
    });
  }

  async backupNote(
    note: CombinedNote,
    changeType: "create" | "update" | "delete" = "update",
  ): Promise<void> {
    if (!this.db) await this.init();

    try {
      // Encrypt the note content
      const { encrypted, iv } = await encryptData(
        JSON.stringify({
          content: note.content,
          fullNote: note,
        }),
      );

      const backupEntry: BackupEntry = {
        id: `${note.id}-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        noteId: note.id,
        noteSource: note.source === "redis" ? "local" : "cloud",
        timestamp: Date.now(),
        encryptedContent: encrypted,
        iv: iv,
        title: note.title,
        changeType,
        metadata: {
          wordCount: this.calculateWordCount(note.content),
          charCount: note.content.length,
          isPinned: note.isPinned,
          isPrivate: note.isPrivate,
        },
      };

      // Store the backup
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      await new Promise<void>((resolve, reject) => {
        const request = store.add(backupEntry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Clean up old backups (keep only last 50 per note)
      await this.cleanupOldBackups(note.id);

      console.log(`✅ Backup created for note: ${note.title} (${changeType})`);
    } catch (error) {
      console.error("Failed to backup note:", error);
    }
  }

  async backupMultipleNotes(notes: CombinedNote[]): Promise<void> {
    console.log(`🔄 Backing up ${notes.length} notes...`);

    for (const note of notes) {
      await this.backupNote(note, "update");
    }

    console.log(`✅ Backup completed for ${notes.length} notes`);
  }

  async getBackupsForNote(noteId: string, limit = 10): Promise<BackupEntry[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("noteId");
      const request = index.getAll(noteId);

      request.onsuccess = () => {
        const backups = request.result
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit);
        resolve(backups);
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Update the restore method to actually restore the note
  async restoreNoteFromBackup(
    backupId: string,
  ): Promise<{ success: boolean; note?: CombinedNote; error?: string }> {
    if (!this.db) await this.init();

    try {
      const backup = await this.getBackupById(backupId);
      if (!backup) return { success: false, error: "Backup not found" };

      // Decrypt the content
      const decryptedData = await decryptData(
        backup.encryptedContent,
        backup.iv,
      );
      const { fullNote } = JSON.parse(decryptedData);

      const restoredNote = fullNote as CombinedNote;

      // If we have a restore callback, use it to actually restore the note
      if (this.restoreCallback) {
        await this.restoreCallback(restoredNote);
        return { success: true, note: restoredNote };
      }

      return { success: true, note: restoredNote };
    } catch (error) {
      console.error("Failed to restore note from backup:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getAllBackups(): Promise<BackupEntry[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const backups = request.result.sort(
          (a, b) => b.timestamp - a.timestamp,
        );
        resolve(backups);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getBackupStats(): Promise<{
    totalBackups: number;
    localBackups: number;
    cloudBackups: number;
    oldestBackup: Date | null;
    newestBackup: Date | null;
  }> {
    const backups = await this.getAllBackups();

    return {
      totalBackups: backups.length,
      localBackups: backups.filter((b) => b.noteSource === "local").length,
      cloudBackups: backups.filter((b) => b.noteSource === "cloud").length,
      oldestBackup:
        backups.length > 0
          ? new Date(Math.min(...backups.map((b) => b.timestamp)))
          : null,
      newestBackup:
        backups.length > 0
          ? new Date(Math.max(...backups.map((b) => b.timestamp)))
          : null,
    };
  }

  async deleteAllBackups(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("🗑️ All backups deleted");
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Update export to decrypt notes for readability
  async exportBackups(): Promise<string> {
    const backups = await this.getAllBackups();

    // Decrypt all backups for export
    const decryptedBackups = await Promise.all(
      backups.map(async (backup) => {
        try {
          const decryptedData = await decryptData(
            backup.encryptedContent,
            backup.iv,
          );
          const { content, fullNote } = JSON.parse(decryptedData);

          return {
            id: backup.id,
            noteId: backup.noteId,
            noteSource: backup.noteSource,
            timestamp: backup.timestamp,
            title: backup.title,
            changeType: backup.changeType,
            metadata: backup.metadata,
            // Include readable content
            content: content,
            fullNote: fullNote,
            exportDate: new Date().toISOString(),
          };
        } catch (error) {
          console.error(`Failed to decrypt backup ${backup.id}:`, error);
          return {
            ...backup,
            content: "[DECRYPTION_FAILED]",
            error: "Failed to decrypt this backup",
          };
        }
      }),
    );

    return JSON.stringify(
      {
        exportInfo: {
          exportDate: new Date().toISOString(),
          totalBackups: decryptedBackups.length,
          note: "This export contains your decrypted notes for backup purposes. Keep this file secure.",
        },
        backups: decryptedBackups,
      },
      null,
      2,
    );
  }

  // Add method to get readable backup content
  async getReadableBackupContent(
    backupId: string,
  ): Promise<{ content: string; fullNote: CombinedNote } | null> {
    try {
      const backup = await this.getBackupById(backupId);
      if (!backup) return null;

      const decryptedData = await decryptData(
        backup.encryptedContent,
        backup.iv,
      );
      return JSON.parse(decryptedData);
    } catch (error) {
      console.error("Failed to get readable content:", error);
      return null;
    }
  }

  private async getBackupById(id: string): Promise<BackupEntry | null> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async cleanupOldBackups(noteId: string): Promise<void> {
    const backups = await this.getBackupsForNote(noteId, 1000); // Get all backups for this note

    if (backups.length <= MAX_BACKUPS) return;

    // Keep only the newest MAX_BACKUPS
    const backupsToDelete = backups.slice(MAX_BACKUPS);

    const transaction = this.db!.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    for (const backup of backupsToDelete) {
      store.delete(backup.id);
    }

    console.log(
      `🧹 Cleaned up ${backupsToDelete.length} old backups for note ${noteId}`,
    );
  }

  private calculateWordCount(content: string): number {
    // Create a temporary DOM element to parse HTML safely
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";

    // Count words
    const words = plainText.trim()
      ? plainText.split(/\s+/).filter(Boolean)
      : [];
    return words.length;
  }
}

// Create singleton instance
export const notesBackupManager = new NotesBackupManager();

// Auto-backup hook for React components
export function useNotesBackup(
  onRestoreNote?: (note: any) => Promise<void> | void,
) {
  const [isBackingUp, setIsBackingUp] = React.useState(false);
  const [backupStats, setBackupStats] = React.useState<{
    totalBackups: number;
    localBackups: number;
    cloudBackups: number;
    oldestBackup: Date | null;
    newestBackup: Date | null;
  } | null>(null);

  const backupNote = React.useCallback(
    async (
      note: CombinedNote,
      changeType: "create" | "update" | "delete" = "update",
    ) => {
      setIsBackingUp(true);
      try {
        await notesBackupManager.backupNote(note, changeType);
      } catch (error) {
        console.error("Backup failed:", error);
      } finally {
        setIsBackingUp(false);
      }
    },
    [],
  );

  const backupAllNotes = React.useCallback(async (notes: CombinedNote[]) => {
    setIsBackingUp(true);
    try {
      await notesBackupManager.backupMultipleNotes(notes);
    } catch (error) {
      console.error("Bulk backup failed:", error);
    } finally {
      setIsBackingUp(false);
    }
  }, []);

  const loadBackupStats = React.useCallback(async () => {
    try {
      const stats = await notesBackupManager.getBackupStats();
      setBackupStats(stats);
    } catch (error) {
      console.error("Failed to load backup stats:", error);
    }
  }, []);

  React.useEffect(() => {
    // Initialize the backup manager and set restore callback
    notesBackupManager.init().catch(console.error);
    if (onRestoreNote) {
      notesBackupManager.setRestoreCallback(onRestoreNote);
    }
    loadBackupStats();
  }, [loadBackupStats, onRestoreNote]);

  const restoreFromBackup = React.useCallback(async (backupId: string) => {
    try {
      return await notesBackupManager.restoreNoteFromBackup(backupId);
    } catch (error) {
      console.error("Restore failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }, []);

  return {
    backupNote,
    backupAllNotes,
    restoreFromBackup,
    isBackingUp,
    backupStats,
    loadBackupStats,
    getBackupsForNote:
      notesBackupManager.getBackupsForNote.bind(notesBackupManager),
    getAllBackups: notesBackupManager.getAllBackups.bind(notesBackupManager),
    deleteAllBackups:
      notesBackupManager.deleteAllBackups.bind(notesBackupManager),
    exportBackups: notesBackupManager.exportBackups.bind(notesBackupManager),
    getReadableBackupContent:
      notesBackupManager.getReadableBackupContent.bind(notesBackupManager),
  };
}
