"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  IconShare2,
  IconCopy,
  IconCheck,
  IconWorld,
  IconUsers,
  IconEye,
  IconEyeOff,
  IconLock,
  IconClock,
  IconX,
  IconUserPlus,
  IconTrash,
} from "@tabler/icons-react";
import { Modal } from "@/components/ds/modal";
import { IconButton } from "@/components/ds/icon-button";
import { useToast } from "@/components/ui/toast";
import { sharingOperation } from "@/app/actions/sharing";

interface ShareNoteButtonProps {
  noteId: string;
  noteTitle: string;
  noteSource: "redis" | "supabase";
  isPrivate: boolean;
  isAuthenticated: boolean;
  userId: string;
}

interface ShareInfo {
  isPublic: boolean;
  shortcode: string | null;
  users: string[];
  isAnonymous: boolean;
  hasPassword: boolean;
  expiresAt: string | null;
  viewCount: number;
}

export default function ShareNoteButton({
  noteId,
  noteTitle,
  noteSource,
  isPrivate,
  isAuthenticated,
  userId,
}: ShareNoteButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState<ShareInfo>({
    isPublic: true,
    shortcode: null,
    users: [],
    isAnonymous: false,
    hasPassword: false,
    expiresAt: null,
    viewCount: 0,
  });

  // Form state
  const [isPublic, setIsPublic] = useState(true);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [useExpiry, setUseExpiry] = useState(false);
  const [newUsername, setNewUsername] = useState("");

  const toast = useToast();

  const loadShareInfo = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sharingOperation({
        operation: "getUsers",
        noteId,
        currentUserId: userId,
      });
      if (result.success) {
        const data = result as any;
        setInfo({
          isPublic: data.isPublic ?? true,
          shortcode: data.shortcode ?? null,
          users: data.users ?? [],
          isAnonymous: data.isAnonymous ?? false,
          hasPassword: data.hasPassword ?? false,
          expiresAt: data.expiresAt ?? null,
          viewCount: data.viewCount ?? 0,
        });
        setIsPublic(data.isPublic ?? true);
        setIsAnonymous(data.isAnonymous ?? false);
        setUsePassword(data.hasPassword ?? false);
        if (data.expiresAt) {
          setUseExpiry(true);
          setExpiresAt(data.expiresAt.split("T")[0]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [noteId, userId]);

  useEffect(() => {
    if (open) loadShareInfo();
  }, [open, loadShareInfo]);

  const handleShare = useCallback(async () => {
    setSaving(true);
    try {
      const result = await sharingOperation({
        operation: "share",
        noteId,
        isPublic,
        currentUserId: userId,
        storage: noteSource,
        isAnonymous,
        password: usePassword ? password : null,
        expiresAt: useExpiry && expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      if (result.success) {
        toast.showSuccess("Share settings updated");
        await loadShareInfo();
        setPassword("");
      } else {
        toast.showError((result as any).error || "Failed to update share settings");
      }
    } finally {
      setSaving(false);
    }
  }, [noteId, isPublic, userId, noteSource, isAnonymous, usePassword, password, useExpiry, expiresAt, toast, loadShareInfo]);

  const handleAddUser = useCallback(async () => {
    if (!newUsername.trim()) return;
    setSaving(true);
    try {
      const result = await sharingOperation({
        operation: "share",
        noteId,
        isPublic: false,
        username: newUsername.trim(),
        currentUserId: userId,
        storage: noteSource,
      });
      if (result.success) {
        setNewUsername("");
        await loadShareInfo();
      } else {
        toast.showError((result as any).error || "Failed to add user");
      }
    } finally {
      setSaving(false);
    }
  }, [noteId, newUsername, userId, noteSource, toast, loadShareInfo]);

  const handleRemoveUser = useCallback(async (username: string) => {
    const result = await sharingOperation({
      operation: "removeUser",
      noteId,
      username,
      currentUserId: userId,
    });
    if (result.success) {
      await loadShareInfo();
    } else {
      toast.showError("Failed to remove user");
    }
  }, [noteId, userId, toast, loadShareInfo]);

  const handleStopSharing = useCallback(async () => {
    const result = await sharingOperation({
      operation: "stopSharing",
      noteId,
      currentUserId: userId,
    });
    if (result.success) {
      setInfo((prev) => ({ ...prev, shortcode: null, users: [] }));
      toast.showSuccess("Sharing stopped");
      setOpen(false);
    }
  }, [noteId, userId, toast]);

  const handleCopyLink = useCallback(() => {
    if (!info.shortcode) return;
    const url = `${window.location.origin}/n/${info.shortcode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [info.shortcode]);

  const shareUrl = info.shortcode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/n/${info.shortcode}`
    : null;

  if (!isAuthenticated) return null;

  return (
    <>
      <IconButton
        label="Share note"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <IconShare2 size={14} className={info.shortcode ? "text-[var(--color-accent)]" : ""} />
      </IconButton>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Share"
        size="sm"
      >
        {loading ? (
          <div className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading...</div>
        ) : (
          <div className="space-y-4">
            {/* Share link */}
            {info.shortcode ? (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl || ""}
                  className="flex-1 h-9 px-3 text-xs bg-[var(--color-bg-tertiary)] rounded-[var(--radius-md)] border border-[var(--color-border-secondary)] text-[var(--color-text-secondary)] truncate"
                />
                <button
                  onClick={handleCopyLink}
                  className="h-9 px-3 flex items-center gap-1.5 text-xs font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Share this note to get a link
              </p>
            )}

            {/* Visibility */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Access
              </label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setIsPublic(true)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-[var(--radius-md)] transition-colors ${
                    isPublic
                      ? "bg-[var(--color-accent)] text-[var(--color-text-on-accent)]"
                      : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-active)]"
                  }`}
                >
                  <IconWorld size={13} />
                  Public
                </button>
                <button
                  onClick={() => setIsPublic(false)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-[var(--radius-md)] transition-colors ${
                    !isPublic
                      ? "bg-[var(--color-accent)] text-[var(--color-text-on-accent)]"
                      : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-active)]"
                  }`}
                >
                  <IconUsers size={13} />
                  Specific people
                </button>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Options
              </label>

              {/* Anonymous */}
              <ToggleRow
                icon={<IconEyeOff size={14} />}
                label="Share anonymously"
                description="Hide your name and avatar"
                checked={isAnonymous}
                onChange={setIsAnonymous}
              />

              {/* Password */}
              <ToggleRow
                icon={<IconLock size={14} />}
                label="Password protect"
                checked={usePassword}
                onChange={(v) => {
                  setUsePassword(v);
                  if (!v) setPassword("");
                }}
              />
              {usePassword && (
                <input
                  type="password"
                  placeholder={info.hasPassword ? "Leave blank to keep current" : "Enter password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-9 px-3 text-xs bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:outline-none"
                />
              )}

              {/* Expiration */}
              <ToggleRow
                icon={<IconClock size={14} />}
                label="Set expiration"
                checked={useExpiry}
                onChange={(v) => {
                  setUseExpiry(v);
                  if (!v) setExpiresAt("");
                }}
              />
              {useExpiry && (
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full h-9 px-3 text-xs bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] focus:border-[var(--color-border-focus)] focus:outline-none"
                />
              )}
            </div>

            {/* Save button */}
            <button
              onClick={handleShare}
              disabled={saving}
              className="w-full h-9 text-xs font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : info.shortcode ? "Update" : "Create share link"}
            </button>

            {/* Shared users (private mode) */}
            {!isPublic && info.shortcode && (
              <div className="space-y-2 pt-2 border-t border-[var(--color-border-secondary)]">
                <label className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                  People with access
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddUser()}
                    className="flex-1 h-8 px-3 text-xs bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:outline-none"
                  />
                  <button
                    onClick={handleAddUser}
                    disabled={saving || !newUsername.trim()}
                    className="h-8 px-2.5 flex items-center gap-1 text-xs font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-[var(--radius-md)] hover:bg-[var(--color-active)] disabled:opacity-50 transition-colors"
                  >
                    <IconUserPlus size={13} />
                    Add
                  </button>
                </div>
                {info.users.length > 0 && (
                  <ul className="space-y-1">
                    {info.users.map((user) => (
                      <li
                        key={user}
                        className="flex items-center justify-between px-2.5 py-1.5 text-xs bg-[var(--color-bg-tertiary)] rounded-[var(--radius-md)]"
                      >
                        <span className="text-[var(--color-text-primary)]">{user}</span>
                        <button
                          onClick={() => handleRemoveUser(user)}
                          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors"
                        >
                          <IconX size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Stats + stop sharing */}
            {info.shortcode && (
              <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-secondary)]">
                <span className="text-[10px] text-[var(--color-text-tertiary)]">
                  <IconEye size={11} className="inline mr-1" />
                  {info.viewCount} view{info.viewCount !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={handleStopSharing}
                  className="flex items-center gap-1 text-[10px] text-[var(--color-danger)] hover:text-[var(--color-danger)]/80 transition-colors"
                >
                  <IconTrash size={11} />
                  Stop sharing
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors text-left"
    >
      <span className="text-[var(--color-text-tertiary)]">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[var(--color-text-primary)]">{label}</p>
        {description && (
          <p className="text-[10px] text-[var(--color-text-tertiary)] leading-tight">{description}</p>
        )}
      </div>
      <div
        className={`w-8 h-[18px] rounded-full transition-colors duration-[var(--duration-fast)] relative ${
          checked ? "bg-[var(--color-accent)]" : "bg-[var(--color-border-primary)]"
        }`}
      >
        <div
          className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-xs transition-transform duration-[var(--duration-fast)] ${
            checked ? "translate-x-[16px]" : "translate-x-[2px]"
          }`}
        />
      </div>
    </button>
  );
}
