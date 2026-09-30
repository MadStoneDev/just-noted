"use client";

import React, { useCallback, useEffect, useState } from "react";
import { IconDownload, IconLoader2 } from "@tabler/icons-react";
import {
  requestAccountExport,
  getAccountExports,
  getExportDownloadUrl,
  type AccountExportItem,
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

export default function AccountExportSection() {
  const { showError, showSuccess } = useToast();
  const [items, setItems] = useState<AccountExportItem[]>([]);
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
    const r = await requestAccountExport();
    setBusy(false);
    if (r.success) { showSuccess("Preparing your export…"); load(); }
    else showError(r.error || "Couldn't start the export.");
  };

  const download = async (id: string) => {
    const r = await getExportDownloadUrl(id);
    if (r.ok && r.url) window.open(r.url, "_blank");
    else showError("This export isn’t available to download.");
  };

  const expired = (i: AccountExportItem) => !!i.expiresAt && new Date(i.expiresAt) < new Date();

  return (
    <div>
      <h2 className="text-[13.5px] font-semibold text-[var(--color-ink-1)] mb-1">Export your data</h2>
      <p className="text-[12.5px] text-[var(--color-ink-4)] leading-relaxed mb-3">
        Download a complete copy of your account — notes, notebooks, tags, version history and
        account details — as a JSON file. Exports are available for 7 days, then deleted.
      </p>
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
            <li key={i.id} className="flex items-center justify-between py-2 text-[12.5px]">
              <div className="min-w-0">
                <span className="text-[var(--color-ink-2)]">{fmtDate(i.createdAt)}</span>
                {i.sizeBytes ? <span className="text-[var(--color-ink-5)]"> · {fmtSize(i.sizeBytes)}</span> : null}
              </div>
              {i.status === "ready" && !expired(i) ? (
                <button onClick={() => download(i.id)} className="text-[var(--color-accent-text)] hover:underline font-medium">
                  Download
                </button>
              ) : (
                <span className="text-[11.5px] text-[var(--color-ink-5)]">
                  {i.status === "failed"
                    ? "Failed"
                    : expired(i)
                      ? "Expired"
                      : i.status === "ready"
                        ? "Expired"
                        : "Preparing…"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
