"use client";

import React from "react";
import {
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  MAX_BACKUPS,
  ENCRYPTION_KEY_NAME,
} from "@/constants/app";

// ===========================
// INDEXEDDB SUPPORT CHECK
// ===========================
function checkIndexedDBSupport(): void {
  if (typeof window === "undefined") {
    throw new Error("Cannot use IndexedDB in server-side rendering context");
  }

  if (!window.indexedDB) {
    throw new Error(
      "IndexedDB is not supported in this browser. Backup functionality is unavailable.",
    );
  }
}

// ===========================
// ENCRYPTION UTILITIES
// ===========================
async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  const existingKey = await getStoredKey();
  if (existingKey) {
    return existingKey;
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

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

// ===========================
// TYPES
// ===========================
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
}

type RestoreCallback = (restoredNote: any) => Promise<void> | void;

// ===========================
// BACKUP MANAGER CLASS
// ===========================
class NotesBackupManager {
  private db: IDBDatabase | null = null;
  private restoreCallback: RestoreCallback | null = null;
  private isSupported: boolean = false;
  private initPromise: Promise<void> | null = null;
  private isInitializing: boolean = false;

  constructor() {
    // Check support on construction (client-side only)
    if (typeof window !== "undefined") {
      this.isSupported = !!window.indexedDB;
    }
  }

  setRestoreCallback(callback: RestoreCallback) {
    this.restoreCallback = callback;
  }

  // CRITICAL FIX: Ensure init is only called once and is awaited properly
  private async ensureInitialized(): Promise<void> {
    if (this.db) return; // Already initialized

    if (this.initPromise) {
      // Initialization in progress, wait for it
      await this.initPromise;
      return;
    }

    // Start initialization
    this.initPromise = this.init();
    await this.initPromise;
  }

  async init(): Promise<void> {
    if (this.db || this.isInitializing) return;

    this.isInitializing = true;
    checkIndexedDBSupport();

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        this.isInitializing = false;
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitializing = false;
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
    if (!this.isSupported) {
      console.warn("IndexedDB not supported - skipping backup");
      return;
    }

    await this.ensureInitialized();

    try {
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

      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      await new Promise<void>((resolve, reject) => {
        const request = store.add(backupEntry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      await this.cleanupOldBackups(note.id);

      console.log(`✅ Backup created for note: ${note.title} (${changeType})`);
    } catch (error) {
      console.error("Failed to backup note:", error);
    }
  }

  async backupMultipleNotes(notes: CombinedNote[]): Promise<void> {
    if (!this.isSupported) {
      console.warn("IndexedDB not supported - skipping backup");
      return;
    }

    console.log(`🔄 Backing up ${notes.length} notes...`);

    for (const note of notes) {
      await this.backupNote(note, "update");
    }

    console.log(`✅ Backup completed for ${notes.length} notes`);
  }

  async getBackupsForNote(noteId: string, limit = 10): Promise<BackupEntry[]> {
    if (!this.isSupported) return [];
    await this.ensureInitialized();

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

  async restoreNoteFromBackup(
    backupId: string,
  ): Promise<{ success: boolean; note?: CombinedNote; error?: string }> {
    if (!this.isSupported) {
      return { success: false, error: "IndexedDB not supported" };
    }

    await this.ensureInitialized();

    try {
      const backup = await this.getBackupById(backupId);
      if (!backup) return { success: false, error: "Backup not found" };

      const decryptedData = await decryptData(
        backup.encryptedContent,
        backup.iv,
      );
      const { fullNote } = JSON.parse(decryptedData);

      const restoredNote = fullNote as CombinedNote;

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
    if (!this.isSupported) return [];
    await this.ensureInitialized();

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
    if (!this.isSupported) return;
    await this.ensureInitialized();

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

  async exportBackups(): Promise<string> {
    const backups = await this.getAllBackups();

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
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async cleanupOldBackups(noteId: string): Promise<void> {
    const backups = await this.getBackupsForNote(noteId, 1000);

    if (backups.length <= MAX_BACKUPS) return;

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
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";

    const words = plainText.trim()
      ? plainText.split(/\s+/).filter(Boolean)
      : [];
    return words.length;
  }
}

// ===========================
// SINGLETON INSTANCE
// ===========================
export const notesBackupManager = new NotesBackupManager();

// ===========================
// REACT HOOK
// ===========================
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
