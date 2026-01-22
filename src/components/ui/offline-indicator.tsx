"use client";

import React, { useState, useEffect } from "react";
import { IconWifi, IconWifiOff, IconCloudUpload, IconX } from "@tabler/icons-react";
import { useOnlineStatus, useOfflineQueue } from "@/hooks/use-online-status";

/**
 * Offline indicator that shows when the user is offline
 * Also shows pending sync count when back online
 */
export default function OfflineIndicator() {
  const { isOnline, lastOfflineAt } = useOnlineStatus();
  const { pendingCount } = useOfflineQueue();
  const [showBanner, setShowBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  // Show banner when going offline
  useEffect(() => {
    if (!isOnline) {
      setShowBanner(true);
      setWasOffline(true);
    } else if (wasOffline) {
      // Show "back online" message briefly
      setShowBanner(true);
      const timer = setTimeout(() => {
        setShowBanner(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  // Don't render if online and no banner to show
  if (isOnline && !showBanner && pendingCount === 0) {
    return null;
  }

  return (
    <>
      {/* Floating indicator */}
      {showBanner && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
            isOnline
              ? "bg-green-500 text-white"
              : "bg-amber-500 text-amber-900"
          }`}
        >
          {isOnline ? (
            <>
              <IconWifi size={18} />
              <span>Back online</span>
              {pendingCount > 0 && (
                <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                  Syncing {pendingCount} change{pendingCount !== 1 ? "s" : ""}...
                </span>
              )}
            </>
          ) : (
            <>
              <IconWifiOff size={18} />
              <span>You&apos;re offline</span>
              <span className="text-xs opacity-80">Changes will sync when connected</span>
            </>
          )}
          <button
            onClick={() => setShowBanner(false)}
            className="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors"
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* Persistent offline dot in header (when offline but banner dismissed) */}
      {!isOnline && !showBanner && (
        <button
          onClick={() => setShowBanner(true)}
          className="fixed top-4 right-4 z-50 p-2 bg-amber-500 text-amber-900 rounded-full shadow-lg hover:bg-amber-400 transition-colors"
          title="You're offline - click for details"
        >
          <IconWifiOff size={16} />
        </button>
      )}
    </>
  );
}

/**
 * Compact offline status for use in headers/toolbars
 */
export function OfflineStatusBadge() {
  const { isOnline } = useOnlineStatus();
  const { pendingCount } = useOfflineQueue();

  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
        isOnline
          ? "bg-blue-100 text-blue-700"
          : "bg-amber-100 text-amber-700"
      }`}
    >
      {isOnline ? (
        <>
          <IconCloudUpload size={14} className="animate-pulse" />
          <span>Syncing...</span>
        </>
      ) : (
        <>
          <IconWifiOff size={14} />
          <span>Offline</span>
        </>
      )}
    </div>
  );
}
