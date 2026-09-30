"use client";

import React, { useCallback, useEffect, useState } from "react";
import { IconDownload, IconLoader2 } from "@tabler/icons-react";
import {
  requestAccountExport,
  getAccountExports,
  getExportDownloadUrl,
  type AccountExportItem,
  type ExportFormat,
} from "@/app/actions/exportActions";
import { useToast } from "@/components/ui/toast";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
function fmtSize(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "json", label: "JSON", hint: "Complete, machine-readable" },
  { value: "markdown_zip", label: "Markdown (.zip)", hint: "One file per note, folders per notebook" },
];

export default function AccountExportSection() {
  const { showError, showSuccess } = useToast();
  const [items, setItems] = useState<AccountExportItem[]>([]);
  const [format, setFormat] = useState<ExportFormat>("json");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getAccountExports().then(setItems).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll while anything is still being prepared.
  useEffect(() => {
    if (!items.some((i) => i.status === "pending" || i.status === "processing")) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [items, load]);

  const request = async () => {
    setBusy(true);
    let anonId: string | null = null;
    try { anonId = localStorage.getItem("notes_user_id"); } catch {}
    const r = await requestAccountExport(format, anonId);
    setBusy(false);
    if (r.success) { showSuccess("Preparing your export — we’ll email you when it’s ready."); load(); }
    else showError(r.error || "Couldn’t start the export.");
  };

  const download = async (id: string) => {
    const r = await getExportDownloadUrl(id);
    if (r.ok && r.url) window.location.href = r.url;
    else showError("This export isn’t available to download.");
  };

  const statusLabel = (i: AccountExportItem): string => {
    if (i.status === "failed") return "Failed";
    if (i.status === "expired") return "Expired";
    if (i.status === "ready") {
      if (i.expiresAt && new Date(i.expiresAt) < new Date()) return "Expired";
      return i.expiresAt ? `Ready · expires ${fmtDate(i.expiresAt)}` : "Ready";
    }
    return "Preparing…";
  };
  const canDownload = (i: AccountExportItem) =>
    i.status === "ready" && (!i.expiresAt || new Date(i.expiresAt) >= new Date());

  return (
    <div>
      <h2 className="text-[13.5px] font-semibold text-[var(--color-ink-1)] mb-1">Export your data</h2>
      <p className="text-[12.5px] text-[var(--color-ink-4)] leading-relaxed mb-1">
        Download a complete copy of your account — notes, notebooks, tags, version history and
        account details. We’ll email you when it’s ready; the download requires being signed in and
        stays available for 7 days. You can request one export every 48 hours.
      </p>
      <p className="text-[11.5px] text-[var(--color-ink-5)] mb-3">Device notes from this browser only.</p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {FORMATS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFormat(f.value)}
            title={f.hint}
            className={`h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium border transition-colors ${
              format === f.value
                ? "border-[var(--color-accent-tint-border)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
                : "border-[var(--color-border-control)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <button
        onClick={request}
        disabled={busy}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-50"
      >
        {busy ? <IconLoader2 size={14} className="animate-spin" /> : <IconDownload size={14} />}
        Request an export
      </button>

      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--color-hairline-soft)] border-t border-[var(--color-hairline-soft)]">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
              <div className="min-w-0">
                <span className="text-[var(--color-ink-2)]">{fmtDate(i.createdAt)}</span>
                <span className="text-[var(--color-ink-5)]">
                  {" · "}{i.format === "markdown_zip" ? "Markdown" : "JSON"}
                  {i.sizeBytes ? ` · ${fmtSize(i.sizeBytes)}` : ""}
                </span>
              </div>
              {canDownload(i) ? (
                <div className="shrink-0 flex items-center gap-2">
                  {i.expiresAt && (
                    <span className="text-[11px] text-[var(--color-ink-6)]">expires {fmtDate(i.expiresAt)}</span>
                  )}
                  <button onClick={() => download(i.id)} className="text-[var(--color-accent-text)] hover:underline font-medium">
                    Download
                  </button>
                </div>
              ) : (
                <span className="shrink-0 text-[11.5px] text-[var(--color-ink-5)]">{statusLabel(i)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
