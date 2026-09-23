"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  IconShare,
  IconCopy,
  IconCheck,
  IconChevronDown,
  IconLock,
  IconClock,
  IconEyeOff,
  IconUserPlus,
  IconX,
  IconSparkles,
} from "@tabler/icons-react";
import { IconButton } from "@/components/ds/icon-button";
import { Drawer } from "@/components/ds/drawer";
import { Dropdown, DropdownItem } from "@/components/ds/dropdown";
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

type LinkPermission = "off" | "view" | "edit" | "published";
type Role = "view" | "edit";
interface Reader { username: string; role: string }

interface ShareInfo {
  shortcode: string | null;
  users: Reader[];
  isAnonymous: boolean;
  hasPassword: boolean;
  expiresAt: string | null;
  viewCount: number;
  linkPermission: LinkPermission;
}

const PERMISSION_LABEL: Record<LinkPermission, string> = {
  off: "Off",
  view: "Can view",
  edit: "Can edit",
  published: "Published",
};
const PERMISSION_HINT: Record<LinkPermission, string> = {
  off: "No link — pick an access level to create one.",
  view: "Anyone with the link can read this note.",
  edit: "Signed-in visitors can edit. Anonymous editing isn't supported.",
  published: "Listed on your public page and indexable.",
};

export default function ShareNoteButton({
  noteId,
  noteTitle,
  noteSource,
  isAuthenticated,
  userId,
}: ShareNoteButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState<ShareInfo>({
    shortcode: null, users: [], isAnonymous: false, hasPassword: false, expiresAt: null, viewCount: 0, linkPermission: "off",
  });

  const [linkPermission, setLinkPermission] = useState<LinkPermission>("off");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [useExpiry, setUseExpiry] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [addRole, setAddRole] = useState<Role>("view");
  const [canCollaborate, setCanCollaborate] = useState(true);

  const toast = useToast();

  // Friendly copy for the server's collaboration gate.
  const handleGateError = (err?: string, limit?: number): boolean => {
    if (err === "UPGRADE_REQUIRED") {
      toast.showError("Collaboration is a Pro feature — upgrade in Settings › Plan & usage.");
      return true;
    }
    if (err === "COLLAB_LIMIT") {
      toast.showError(`You've reached your collaborator limit${typeof limit === "number" ? ` (${limit})` : ""}. Upgrade for more.`);
      return true;
    }
    return false;
  };

  const loadShareInfo = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sharingOperation({ operation: "getUsers", noteId, currentUserId: userId });
      if (result.success) {
        const data = result as any;
        const perm: LinkPermission = data.linkPermission ?? (data.isPublic ? "view" : "off");
        setInfo({
          shortcode: data.shortcode ?? null,
          users: data.users ?? [],
          isAnonymous: data.isAnonymous ?? false,
          hasPassword: data.hasPassword ?? false,
          expiresAt: data.expiresAt ?? null,
          viewCount: data.viewCount ?? 0,
          linkPermission: perm,
        });
        setLinkPermission(perm);
        setCanCollaborate(data.canCollaborate ?? false);
        setIsAnonymous(data.isAnonymous ?? false);
        setUsePassword(data.hasPassword ?? false);
        setUseExpiry(!!data.expiresAt);
        setExpiresAt(data.expiresAt ? String(data.expiresAt).split("T")[0] : "");
        setPassword("");
      }
    } finally {
      setLoading(false);
    }
  }, [noteId, userId]);

  useEffect(() => { if (open) loadShareInfo(); }, [open, loadShareInfo]);

  useEffect(() => {
    const openShare = () => setOpen(true);
    window.addEventListener("justnoted:open-share", openShare);
    return () => window.removeEventListener("justnoted:open-share", openShare);
  }, []);

  const save = useCallback(
    async (overrides?: Partial<{ linkPermission: LinkPermission; isAnonymous: boolean; usePassword: boolean; useExpiry: boolean }>) => {
      const perm = overrides?.linkPermission ?? linkPermission;
      const anon = overrides?.isAnonymous ?? isAnonymous;
      const pw = (overrides?.usePassword ?? usePassword) ? password : null;
      const exp = (overrides?.useExpiry ?? useExpiry) && expiresAt ? new Date(expiresAt).toISOString() : null;
      setSaving(true);
      try {
        const result = await sharingOperation({
          operation: "share",
          noteId,
          isPublic: perm !== "off",
          linkPermission: perm,
          currentUserId: userId,
          storage: noteSource,
          isAnonymous: perm === "edit" || perm === "published" ? false : anon,
          password: pw,
          expiresAt: exp,
        });
        if (result.success) await loadShareInfo();
        else if (!handleGateError((result as any).error, (result as any).limit)) toast.showError((result as any).error || "Couldn't update sharing");
      } finally {
        setSaving(false);
      }
    },
    [noteId, userId, noteSource, linkPermission, isAnonymous, usePassword, password, useExpiry, expiresAt, loadShareInfo, toast],
  );

  const changePermission = (perm: LinkPermission) => {
    if (perm === "published") return;
    setLinkPermission(perm);
    if (perm === "edit") setIsAnonymous(false);
    save({ linkPermission: perm });
  };

  const addPerson = useCallback(async () => {
    if (!newUsername.trim()) return;
    setSaving(true);
    try {
      const result = await sharingOperation({
        operation: "share",
        noteId,
        isPublic: linkPermission !== "off",
        username: newUsername.trim(),
        role: addRole,
        currentUserId: userId,
        storage: noteSource,
      });
      if (result.success) { setNewUsername(""); await loadShareInfo(); }
      else if (!handleGateError((result as any).error, (result as any).limit)) toast.showError((result as any).error || "Couldn't add that person");
    } finally { setSaving(false); }
  }, [noteId, newUsername, addRole, userId, noteSource, linkPermission, toast, loadShareInfo]);

  const changeReaderRole = useCallback(async (username: string, role: Role) => {
    setSaving(true);
    try {
      const result = await sharingOperation({
        operation: "share", noteId, isPublic: linkPermission !== "off",
        username, role, currentUserId: userId, storage: noteSource,
      });
      if (result.success) await loadShareInfo();
      else if (!handleGateError((result as any).error, (result as any).limit)) toast.showError((result as any).error || "Couldn't change access");
    } finally { setSaving(false); }
  }, [noteId, linkPermission, userId, noteSource, toast, loadShareInfo]);

  const removePerson = useCallback(async (username: string) => {
    const result = await sharingOperation({ operation: "removeUser", noteId, username, currentUserId: userId });
    if (result.success) await loadShareInfo();
    else toast.showError("Couldn't remove that person");
  }, [noteId, userId, toast, loadShareInfo]);

  const stopSharing = useCallback(async () => {
    const count = info.users.length;
    const result = await sharingOperation({ operation: "stopSharing", noteId, currentUserId: userId });
    if (result.success) {
      toast.showSuccess(count > 0 ? `Stopped sharing — ${count} ${count === 1 ? "person" : "people"} lost access` : "Stopped sharing");
      setOpen(false);
    }
  }, [noteId, userId, toast, info.users.length]);

  const shareUrl = info.shortcode && linkPermission !== "off"
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/n/${info.shortcode}`
    : null;

  const copyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  if (!isAuthenticated) return null;

  const hideNameDisabled = linkPermission === "edit" || linkPermission === "published";

  const footer = (
    <div className="flex items-center justify-between">
      <button
        onClick={stopSharing}
        disabled={!info.shortcode}
        className="text-[13px] font-medium text-[var(--color-danger)] hover:opacity-80 transition-opacity disabled:opacity-30"
      >
        Stop sharing
      </button>
      <span className="inline-flex items-center gap-1 text-[10px] font-[family-name:var(--font-meta)] text-[var(--color-ink-6)]">
        <kbd className="px-1.5 py-0.5 rounded-[var(--radius-5)] border border-[var(--color-border-control)]">⇧⌘S</kbd>
      </span>
    </div>
  );

  return (
    <>
      <IconButton label="Share note" size="sm" onClick={() => setOpen(true)}>
        <IconShare size={14} className={info.shortcode && info.linkPermission !== "off" ? "text-[var(--color-accent-text)]" : ""} />
      </IconButton>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Share “${noteTitle || "Untitled"}”`}
        description={`${info.viewCount} view${info.viewCount !== 1 ? "s" : ""}`}
        size="lg"
        footer={footer}
      >
        {loading ? (
          <div className="py-10 text-center text-[13px] text-[var(--color-ink-4)]">Loading…</div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* ===== Access (first) ===== */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2 px-3 h-11 rounded-[var(--radius-8)] bg-[var(--color-raised-soft)]">
                <span className="text-[13px] text-[var(--color-ink-2)]">Anyone with the link</span>
                <Dropdown
                  placement="bottom-end"
                  trigger={
                    <button className="flex items-center gap-1 h-8 px-2.5 rounded-[var(--radius-7)] text-[12.5px] font-medium border border-[var(--color-border-control)] bg-[var(--color-raised)] text-[var(--color-ink-1)] hover:bg-[var(--color-raised-soft)] transition-colors">
                      {PERMISSION_LABEL[linkPermission]}
                      <IconChevronDown size={13} className="opacity-60" />
                    </button>
                  }
                >
                  {(["off", "view", "edit"] as LinkPermission[]).map((p) => {
                    const gated = p === "edit" && !canCollaborate;
                    if (gated) {
                      return (
                        <div key={p} className="px-3 py-1.5 flex items-center gap-2 text-[12px] text-[var(--color-ink-5)] cursor-not-allowed" title="Upgrade to Pro to let people edit">
                          <span className="w-[13px]" />
                          Can edit
                          <span className="ml-auto text-[10px] font-[family-name:var(--font-meta)] px-1 rounded-[var(--radius-4)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]">Pro</span>
                        </div>
                      );
                    }
                    return (
                      <DropdownItem key={p} onClick={() => changePermission(p)}>
                        <span className="flex items-center gap-2">
                          {linkPermission === p ? <IconCheck size={13} className="text-[var(--color-accent-text)]" /> : <span className="w-[13px]" />}
                          {PERMISSION_LABEL[p]}
                        </span>
                      </DropdownItem>
                    );
                  })}
                  <div className="my-1 border-t border-[var(--color-hairline-soft)]" />
                  <div className="px-3 py-1.5 flex items-center gap-2 text-[12px] text-[var(--color-ink-5)] cursor-not-allowed">
                    <span className="w-[13px]" />
                    Published
                    <span className="ml-auto text-[10px] font-[family-name:var(--font-meta)]">soon</span>
                  </div>
                </Dropdown>
              </div>
              <p className="text-[11.5px] text-[var(--color-ink-5)] leading-snug -mt-1">{PERMISSION_HINT[linkPermission]}</p>

              {/* URL + Copy (once a link exists) */}
              {shareUrl && (
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 h-9 px-3 rounded-[var(--radius-8)] bg-[var(--color-raised)] border border-[var(--color-hairline)] font-[family-name:var(--font-meta)] text-[12.5px] text-[var(--color-ink-2)] truncate"
                  />
                  <button
                    onClick={copyLink}
                    className="h-9 px-3.5 flex items-center gap-1.5 text-[13px] font-semibold rounded-[var(--radius-8)] bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity"
                  >
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              )}

              {/* Inline switches */}
              {linkPermission !== "off" && (
                <div className="flex flex-col divide-y divide-[var(--color-hairline-soft)] rounded-[var(--radius-8)] border border-[var(--color-hairline)]">
                  <Switch icon={<IconLock size={14} />} label="Password" on={usePassword}
                    onToggle={(v) => { setUsePassword(v); if (!v) { setPassword(""); save({ usePassword: false }); } }}>
                    {usePassword && (
                      <input type="password" placeholder={info.hasPassword ? "Leave blank to keep current" : "Set a password"}
                        value={password} onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => (password || info.hasPassword) && save()} onKeyDown={(e) => e.key === "Enter" && save()}
                        className="mt-2 w-full h-9 px-3 text-[13px] bg-[var(--color-raised)] border border-[var(--color-hairline)] rounded-[var(--radius-7)] text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)] focus:border-[var(--color-accent-tint-border)] focus:outline-none" />
                    )}
                  </Switch>
                  <Switch icon={<IconClock size={14} />} label="Expires" on={useExpiry}
                    onToggle={(v) => { setUseExpiry(v); if (!v) { setExpiresAt(""); save({ useExpiry: false }); } }}>
                    {useExpiry && (
                      <input type="date" value={expiresAt} min={new Date().toISOString().split("T")[0]}
                        onChange={(e) => setExpiresAt(e.target.value)} onBlur={() => expiresAt && save()}
                        className="mt-2 w-full h-9 px-3 text-[13px] bg-[var(--color-raised)] border border-[var(--color-hairline)] rounded-[var(--radius-7)] text-[var(--color-ink-1)] focus:border-[var(--color-accent-tint-border)] focus:outline-none" />
                    )}
                  </Switch>
                  <Switch icon={<IconEyeOff size={14} />} label="Hide my name" on={isAnonymous && !hideNameDisabled}
                    disabled={hideNameDisabled} hint={hideNameDisabled ? "Edits stay attributable" : undefined}
                    onToggle={(v) => { setIsAnonymous(v); save({ isAnonymous: v }); }} />
                </div>
              )}
            </div>

            {/* Upsell — editing is Pro */}
            {!canCollaborate && (
              <button
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent("justnoted:open-settings", { detail: "Plan & usage" }));
                }}
                className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-[var(--radius-9)] bg-[var(--color-accent-tint)] border border-[var(--color-accent-tint-border)] hover:opacity-90 transition-opacity"
              >
                <IconSparkles size={16} className="text-[var(--color-accent-text)] shrink-0" />
                <span className="flex-1 min-w-0 text-[12.5px] leading-snug text-[var(--color-ink-2)]">
                  <span className="font-semibold text-[var(--color-accent-text)]">Upgrade to Pro</span> to let people edit — real-time collaboration, editors &amp; more.
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-[var(--color-accent-text)]">Upgrade</span>
              </button>
            )}

            {/* ===== People ===== */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)]">People with access</div>
              {info.users.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {info.users.map((u) => (
                    <li key={u.username}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-8)] border ${
                        u.role === "edit" ? "bg-[var(--color-accent-tint)] border-[var(--color-accent-tint-border)]" : "border-[var(--color-hairline)]"
                      }`}>
                      <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[12px] font-semibold bg-[var(--color-raised-soft)] text-[var(--color-ink-3)] shrink-0">
                        {u.username.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="flex-1 min-w-0 text-[13.5px] text-[var(--color-ink-1)] truncate">@{u.username}</span>
                      <Dropdown
                        placement="bottom-end"
                        trigger={
                          <button className="flex items-center gap-1 h-7 px-2 rounded-[var(--radius-6)] text-[11.5px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised)] transition-colors">
                            {u.role === "edit" ? "Can edit" : "Can view"}
                            <IconChevronDown size={11} className="opacity-60" />
                          </button>
                        }
                      >
                        <DropdownItem onClick={() => changeReaderRole(u.username, "view")}>Can view</DropdownItem>
                        {canCollaborate ? (
                          <DropdownItem onClick={() => changeReaderRole(u.username, "edit")}>Can edit</DropdownItem>
                        ) : (
                          <div className="px-3 py-2.5 flex items-center gap-2 text-[13px] text-[var(--color-ink-5)] cursor-not-allowed" title="Upgrade to Pro to let people edit">
                            Can edit
                            <span className="ml-auto text-[10px] font-[family-name:var(--font-meta)] px-1 rounded-[var(--radius-4)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]">Pro</span>
                          </div>
                        )}
                      </Dropdown>
                      <button onClick={() => removePerson(u.username)} aria-label={`Remove @${u.username}`}
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-[var(--radius-6)] text-[var(--color-ink-5)] hover:text-[var(--color-danger)] hover:bg-[var(--color-raised-soft)] transition-colors">
                        <IconX size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* Add row: identifier + role + Add */}
              <div className="flex items-center gap-2 mt-0.5">
                <input type="text" placeholder="Username or email" value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPerson()}
                  className="flex-1 h-9 px-3 text-[13px] bg-[var(--color-raised)] border border-[var(--color-hairline)] rounded-[var(--radius-8)] text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)] focus:border-[var(--color-accent-tint-border)] focus:outline-none" />
                <Dropdown
                  placement="bottom-end"
                  trigger={
                    <button className="h-9 px-2.5 flex items-center gap-1 text-[12.5px] font-medium rounded-[var(--radius-8)] border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors">
                      {addRole === "edit" ? "Can edit" : "Can view"}
                      <IconChevronDown size={12} className="opacity-60" />
                    </button>
                  }
                >
                  <DropdownItem onClick={() => setAddRole("view")}>Can view</DropdownItem>
                  {canCollaborate ? (
                    <DropdownItem onClick={() => setAddRole("edit")}>Can edit</DropdownItem>
                  ) : (
                    <div className="px-3 py-2.5 flex items-center gap-2 text-[13px] text-[var(--color-ink-5)] cursor-not-allowed" title="Upgrade to Pro to let people edit">
                      Can edit
                      <span className="ml-auto text-[10px] font-[family-name:var(--font-meta)] px-1 rounded-[var(--radius-4)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]">Pro</span>
                    </div>
                  )}
                </Dropdown>
                <button onClick={addPerson} disabled={saving || !newUsername.trim()}
                  className="h-9 px-3 flex items-center gap-1.5 text-[13px] font-semibold rounded-[var(--radius-8)] bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity disabled:opacity-40">
                  <IconUserPlus size={14} />
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

// 30×17 inline switch with an optional field revealed beneath (design surface 04).
function Switch({
  icon, label, hint, on, disabled, onToggle, children,
}: {
  icon: React.ReactNode; label: string; hint?: string; on: boolean; disabled?: boolean;
  onToggle: (v: boolean) => void; children?: React.ReactNode;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className={disabled ? "text-[var(--color-ink-6)]" : "text-[var(--color-ink-4)]"}>{icon}</span>
        <div className="flex-1 min-w-0">
          <span className={`text-[13px] ${disabled ? "text-[var(--color-ink-5)]" : "text-[var(--color-ink-1)]"}`}>{label}</span>
          {hint && <span className="ml-2 text-[11px] text-[var(--color-ink-5)]">{hint}</span>}
        </div>
        <button type="button" role="switch" aria-checked={on} disabled={disabled}
          onClick={() => !disabled && onToggle(!on)}
          className={`relative w-[30px] h-[17px] rounded-full transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
            on ? "bg-[var(--color-accent-fill)]" : "bg-[var(--color-border-control)]"
          }`}>
          <span className={`absolute top-[2px] w-[13px] h-[13px] rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-[15px]" : "translate-x-[2px]"}`} />
        </button>
      </div>
      {children}
    </div>
  );
}
