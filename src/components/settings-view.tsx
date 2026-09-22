"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { uploadAvatar } from "@/app/actions/avatarActions";
import { compressImage } from "@/utils/image/compress";
import { useToast } from "@/components/ui/toast";
import { useTheme } from "@/components/ds/theme-toggle";
import {
  readEditorFont,
  writeEditorFont,
  type EditorFont,
  readEditorFontSize,
  writeEditorFontSize,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
} from "@/utils/editor-font";
import {
  IconX,
  IconSun,
  IconMoon,
  IconDeviceDesktop,
  IconUser,
  IconPlus,
  IconLogout,
  IconCheck,
} from "@tabler/icons-react";
import {
  getAccounts,
  removeAccount,
  switchToAccount,
  MAX_ACCOUNTS,
  type DeviceAccount,
} from "@/utils/accounts";

interface SettingsViewProps {
  onClose: () => void;
}

const SECTIONS = [
  "Appearance",
  "Account",
  "Editor",
  "Sync & data",
  "Notifications",
  "Security",
] as const;
type Section = (typeof SECTIONS)[number];

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: IconSun, bg: "#FBFCFB", ink: "#131817" },
  { value: "dark" as const, label: "Dark", icon: IconMoon, bg: "#0A0C0C", ink: "#EEF1F0" },
  { value: "system" as const, label: "System", icon: IconDeviceDesktop, bg: "#FBFCFB", ink: "#131817" },
];

const FONT_OPTIONS: { value: EditorFont; label: string; family: string }[] = [
  { value: "serif", label: "Serif", family: "var(--font-newsreader), Georgia, serif" },
  { value: "sans", label: "Sans", family: "var(--font-public-sans), system-ui, sans-serif" },
  { value: "mono", label: "Mono", family: '"JetBrains Mono", ui-monospace, monospace' },
];

// Account settings, in-shell (was the separate /profile page).
function AccountSection() {
  const supabase = createClient();
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (alive) setLoading(false); return; }
      const { data: author } = await supabase
        .from("authors")
        .select("username, avatar_url")
        .eq("id", user.id)
        .single();
      if (!alive) return;
      setUserId(user.id);
      setEmail(user.email || "");
      setUsername(author?.username || "");
      setOriginalUsername(author?.username || "");
      setAvatarUrl(author?.avatar_url || "");
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const onAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    setAvatarPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
  };

  const dirty = username.trim() !== originalUsername || avatarFile !== null;

  const save = async () => {
    if (!userId) return;
    const trimmed = username.trim();
    if (trimmed.length < 3) { showError("Username must be at least 3 characters."); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { showError("Letters, numbers and underscores only."); return; }
    setSaving(true);
    try {
      if (trimmed.toLowerCase() !== originalUsername.toLowerCase()) {
        const { data: existing } = await supabase.from("authors").select("id").ilike("username", trimmed);
        if (existing && existing.some((r: any) => r.id !== userId)) {
          showError("That username is already taken."); setSaving(false); return;
        }
      }
      let newAvatarUrl = avatarUrl;
      if (avatarFile) {
        const compressed = await compressImage(avatarFile, { maxDim: 512 });
        const fd = new FormData();
        fd.append("file", compressed);
        const res = await uploadAvatar(fd);
        if (!res.success || !res.url) { showError(res.error || "Avatar upload failed."); setSaving(false); return; }
        newAvatarUrl = res.url;
      }
      const { error } = await supabase.from("authors").update({ username: trimmed, avatar_url: newAvatarUrl }).eq("id", userId);
      if (error) { showError("Failed to save."); setSaving(false); return; }
      setOriginalUsername(trimmed);
      setAvatarUrl(newAvatarUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      showSuccess("Saved");
    } catch {
      showError("Something went wrong.");
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10 w-full rounded-[var(--radius-8)]" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-[var(--color-raised-soft)] flex items-center justify-center shrink-0 ring-1 ring-[var(--color-hairline)]">
          {avatarPreview || avatarUrl ? (
            <img src={avatarPreview || avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[var(--color-ink-5)] text-xl">?</span>
          )}
        </div>
        <div>
          <label className="inline-flex items-center h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />
            Change avatar
          </label>
          <p className="mt-1.5 text-[11.5px] text-[var(--color-ink-5)]">PNG or JPG, up to a few MB.</p>
        </div>
      </div>

      {/* Username */}
      <div>
        <label className="block mb-1.5 text-[13px] font-medium text-[var(--color-ink-2)]">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
          maxLength={30}
          className="w-full h-10 px-3 text-[14px] bg-[var(--color-raised)] border border-[var(--color-border-control)] rounded-[var(--radius-8)] text-[var(--color-ink)] focus:border-[var(--color-accent-tint-border)] focus:outline-none"
        />
        <p className="mt-1.5 text-[11.5px] text-[var(--color-ink-5)]">Letters, numbers and underscores. Collaborators see this name.</p>
      </div>

      {/* Email */}
      <div>
        <label className="block mb-1.5 text-[13px] font-medium text-[var(--color-ink-2)]">Email</label>
        <div className="w-full h-10 px-3 flex items-center text-[14px] bg-[var(--color-panel)] border border-[var(--color-hairline)] rounded-[var(--radius-8)] text-[var(--color-ink-4)]">
          {email}
        </div>
        <p className="mt-1.5 text-[11.5px] text-[var(--color-ink-5)]">Used for sign-in; can't be changed here.</p>
      </div>

      <button
        onClick={save}
        disabled={!dirty || saving}
        className="h-9 px-4 rounded-[var(--radius-7)] text-[13px] font-semibold bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

// "Accounts on this device" — manage the signed-in accounts stored locally
// (design surface 12). Sign out removes an account's session from this device.
function DeviceAccountsSection() {
  const supabase = createClient();
  const { showError } = useToast();
  const [accounts, setAccounts] = useState<DeviceAccount[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setAccounts(getAccounts());
    supabase.auth.getUser().then(({ data }) => setCurrentId(data.user?.id ?? null));
  }, []);

  const signOutHere = async (a: DeviceAccount) => {
    if (a.id === currentId) {
      await supabase.auth.signOut();
      removeAccount(a.id);
      window.location.href = "/";
      return;
    }
    removeAccount(a.id);
    setAccounts(getAccounts());
  };

  const switchTo = async (a: DeviceAccount) => {
    setBusyId(a.id);
    const res = await switchToAccount(supabase, a); // reloads on success
    if (!res.ok) {
      setBusyId(null);
      setAccounts(getAccounts());
      showError("That session expired — sign in again to reconnect it.");
    }
  };

  return (
    <div>
      <div className="mb-1 text-[13px] font-semibold text-[var(--color-ink-1)]">Accounts on this device</div>
      <p className="mb-3 text-[11.5px] text-[var(--color-ink-5)]">
        Switch between accounts without signing in each time. Up to {MAX_ACCOUNTS} on one device.
      </p>

      <div className="space-y-1.5">
        {accounts.map((a) => {
          const isCurrent = a.id === currentId;
          return (
            <div
              key={a.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-9)] border ${
                isCurrent
                  ? "bg-[var(--color-accent-tint)] border-[var(--color-accent-tint-border)]"
                  : "border-[var(--color-hairline)]"
              }`}
            >
              <span className="w-8 h-8 rounded-full overflow-hidden bg-[var(--color-raised-soft)] ring-1 ring-[var(--color-hairline)] flex items-center justify-center text-[var(--color-ink-4)] shrink-0">
                {a.avatarUrl ? (
                  <img src={a.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <IconUser size={17} />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[13px] truncate ${isCurrent ? "text-[var(--color-accent-text)]" : "text-[var(--color-ink-1)]"}`}>
                    @{a.handle || "account"}
                  </span>
                  {isCurrent && <IconCheck size={13} className="text-[var(--color-accent-text)] shrink-0" />}
                </div>
                <div className={`text-[10.5px] font-[family-name:var(--font-meta)] truncate ${a.sessionValid ? "text-[var(--color-ink-5)]" : "text-[var(--color-warn)]"}`}>
                  {a.sessionValid ? a.email : "session expired — sign in"}
                </div>
              </div>
              {!isCurrent && a.sessionValid && (
                <button
                  onClick={() => switchTo(a)}
                  disabled={busyId === a.id}
                  className="h-7 px-2.5 rounded-[var(--radius-6)] text-[12px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-50"
                >
                  {busyId === a.id ? "Switching…" : "Switch"}
                </button>
              )}
              <button
                onClick={() => signOutHere(a)}
                title={isCurrent ? "Sign out" : "Remove from this device"}
                className="h-7 px-2.5 rounded-[var(--radius-6)] text-[12px] font-medium text-[var(--color-ink-4)] hover:text-[var(--color-danger)] hover:bg-[var(--color-raised-soft)] transition-colors inline-flex items-center gap-1"
              >
                <IconLogout size={14} />
                {isCurrent ? "Sign out" : "Remove"}
              </button>
            </div>
          );
        })}
      </div>

      {accounts.length < MAX_ACCOUNTS && (
        <button
          onClick={() => { window.location.href = "/get-access?add=1"; }}
          className="mt-2.5 w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--radius-9)] border border-dashed border-[var(--color-border-control-strong)] text-[13px] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
        >
          <span className="w-8 h-8 rounded-full border border-dashed border-[var(--color-border-control-strong)] flex items-center justify-center shrink-0">
            <IconPlus size={16} />
          </span>
          Add another account
        </button>
      )}
    </div>
  );
}

// Design handoff surface 06 — Settings inside the shell.
export default function SettingsView({ onClose }: SettingsViewProps) {
  const { theme, setTheme } = useTheme();
  const [font, setFont] = useState<EditorFont>("serif");
  const [fontSize, setFontSize] = useState(18);
  const [section, setSection] = useState<Section>("Appearance");

  useEffect(() => {
    setFont(readEditorFont());
    setFontSize(readEditorFontSize());
  }, []);

  const chooseFont = (f: EditorFont) => {
    setFont(f);
    writeEditorFont(f);
  };

  const chooseFontSize = (px: number) => {
    setFontSize(px);
    writeEditorFontSize(px);
  };

  return (
    <div className="flex-1 flex min-h-0 bg-[var(--color-canvas)]">
      {/* Section list — stands in for the notes sidebar while Settings is open */}
      <nav className="w-[260px] flex-none flex flex-col overflow-hidden border-r border-[var(--color-hairline)] bg-[var(--color-panel)]">
        {/* Header matches the notes sidebar's "All Notes" header */}
        <div className="flex items-center h-[52px] flex-none px-4 border-b border-[var(--color-hairline-soft)]">
          <h2 className="text-sm font-semibold text-[var(--color-ink-1)] tracking-tight">Settings</h2>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`w-full text-left px-2.5 py-2 rounded-[var(--radius-8)] text-[13.5px] transition-colors ${
                section === s
                  ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] border border-[var(--color-accent-tint-border)]"
                  : "text-[var(--color-ink-2)] border border-transparent hover:bg-[var(--color-raised-soft)]"
              }`}
            >
              {s}
            </button>
          ))}
          <div className="mt-2 pt-2 border-t border-[var(--color-hairline-soft)]">
            <Link
              href="/profile"
              className="block w-full text-left px-2.5 py-2 rounded-[var(--radius-8)] text-[13.5px] text-[var(--color-danger-strong)] hover:bg-[var(--color-raised-soft)] transition-colors"
            >
              Danger zone
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-[680px] px-10 py-8">
          <div className="flex items-start justify-between mb-6">
            <h1 className="font-[family-name:var(--font-editor)] text-[32px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              {section}
            </h1>
            <button
              onClick={onClose}
              aria-label="Close settings"
              className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-7)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)] transition-colors"
            >
              <IconX size={16} />
            </button>
          </div>

          {section === "Appearance" ? (
            <div className="space-y-8">
              <p className="text-[13px] text-[var(--color-ink-4)] -mt-3">
                Applies to every surface, including shared notes you open.
              </p>

              {/* Theme */}
              <div>
                <h2 className="text-[13.5px] font-semibold text-[var(--color-ink-1)] mb-3">Theme</h2>
                <div className="grid grid-cols-3 gap-3">
                  {THEME_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = theme === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setTheme(opt.value)}
                        className="rounded-[var(--radius-10)] overflow-hidden text-left transition-shadow"
                        style={{
                          border: active
                            ? "2px solid var(--color-accent-fill)"
                            : "2px solid var(--color-hairline)",
                        }}
                      >
                        <div
                          className="h-[84px] flex items-end p-2"
                          style={{ background: opt.bg }}
                        >
                          <span
                            className="h-2 w-1/2 rounded-full"
                            style={{ background: opt.ink, opacity: 0.85 }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-2 bg-[var(--color-panel)]">
                          <Icon size={13} className="text-[var(--color-ink-4)]" />
                          <span className="text-[12.5px] text-[var(--color-ink-2)]">{opt.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Editor font */}
              <div>
                <h2 className="text-[13.5px] font-semibold text-[var(--color-ink-1)] mb-3">Editor font</h2>
                <div className="grid grid-cols-3 gap-3">
                  {FONT_OPTIONS.map((opt) => {
                    const active = font === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => chooseFont(opt.value)}
                        className="rounded-[var(--radius-10)] px-3 py-4 text-center transition-colors"
                        style={{
                          border: active
                            ? "2px solid var(--color-accent-fill)"
                            : "2px solid var(--color-hairline)",
                          background: active ? "var(--color-accent-tint)" : "transparent",
                        }}
                      >
                        <div
                          className="text-[22px] text-[var(--color-ink-1)] leading-none"
                          style={{ fontFamily: opt.family }}
                        >
                          Ag
                        </div>
                        <div className="mt-2 text-[12px] text-[var(--color-ink-3)]">{opt.label}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[12px] text-[var(--color-ink-5)]">
                  Changes the editor body and title only — the rest of the app stays as is.
                </p>
              </div>

              {/* Font size */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[13.5px] font-semibold text-[var(--color-ink-1)]">Font size</h2>
                  <span className="text-[11.5px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  value={fontSize}
                  onChange={(e) => chooseFontSize(parseInt(e.target.value, 10))}
                  className="w-full accent-[var(--color-accent-fill)]"
                />
                <div className="flex justify-between text-[10px] font-[family-name:var(--font-meta)] text-[var(--color-ink-6)]">
                  <span>{FONT_SIZE_MIN}</span>
                  <span>{FONT_SIZE_MAX}</span>
                </div>
              </div>
            </div>
          ) : section === "Account" ? (
            <div className="space-y-8">
              <AccountSection />
              <DeviceAccountsSection />
            </div>
          ) : section === "Security" ? (
            <div className="text-[13.5px] text-[var(--color-ink-4)] leading-[1.6]">
              Notes are encrypted in transit and at rest — this is not end-to-end
              encryption. Active sessions and password management are coming here.
            </div>
          ) : (
            <div className="text-[13.5px] text-[var(--color-ink-4)] leading-[1.6]">
              {section} settings are coming here as the redesign lands. For now,
              your existing controls remain where they were.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
