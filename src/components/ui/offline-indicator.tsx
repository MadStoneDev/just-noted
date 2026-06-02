"use client";

import React, { useState, useEffect } from "react";
import { IconWifi, IconWifiOff, IconX } from "@tabler/icons-react";
import { useOnlineStatus, useOfflineQueue } from "@/hooks/use-online-status";
import { subscribeDrops } from "@/utils/offline-queue";
import { useToast } from "@/components/ui/toast";

export default function OfflineIndicator() {
  const { isOnline } = useOnlineStatus();
  const { pendingCount } = useOfflineQueue();
  const { showError } = useToast();
  const [showBanner, setShowBanner] = useState(false);
  const [confirmedOffline, setConfirmedOffline] = useState(false);

  useEffect(() => {
    return subscribeDrops(() => {
      showError("A note save was discarded after multiple retries.");
    });
  }, [showError]);

  // Verify offline status with an actual fetch to avoid false positives
  useEffect(() => {
    if (!isOnline) {
      fetch("/api/health", { method: "HEAD", cache: "no-store" })
        .then(() => setConfirmedOffline(false))
        .catch(() => {
          setConfirmedOffline(true);
          setShowBanner(true);
        });
    } else {
      if (confirmedOffline) {
        setShowBanner(true);
        setTimeout(() => {
          setShowBanner(false);
          setConfirmedOffline(false);
        }, 3000);
      }
    }
  }, [isOnline]);

  if (!showBanner) return null;

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-medium transition-all duration-300 ${
        isOnline
          ? "bg-[var(--color-success)] text-white"
          : "bg-[var(--color-warning)] text-white"
      }`}
    >
      {isOnline ? (
        <>
          <IconWifi size={14} />
          <span>Back online</span>
        </>
      ) : (
        <>
          <IconWifiOff size={14} />
          <span>Offline — changes saved locally</span>
        </>
      )}
      <button
        onClick={() => setShowBanner(false)}
        className="ml-1 p-0.5 hover:bg-white/20 rounded-full transition-colors"
      >
        <IconX size={12} />
      </button>
    </div>
  );
}

export function OfflineStatusBadge() {
  const { isOnline } = useOnlineStatus();
  const { pendingCount } = useOfflineQueue();

  if (isOnline && pendingCount === 0) return null;
  if (!isOnline) return null; // Don't show badge — the banner handles it

  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
      <span className="animate-pulse-subtle">Syncing</span>
    </div>
  );
}
