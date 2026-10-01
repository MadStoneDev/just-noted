"use client";

import React from "react";

// Reopens the analytics consent banner (ConsentBanner listens for this event).
export default function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("justnoted:open-cookie-settings"))}
      className={className}
    >
      Cookie settings
    </button>
  );
}
