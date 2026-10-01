"use client";

import React from "react";
import { IconInfoCircle, IconAlertTriangle, IconCircleX } from "@tabler/icons-react";

export type NoticeLevel = "info" | "warning" | "error";

// Inline notice (spec §5.5): one shape, three levels; icon · one sentence ·
// optional single right-aligned action. Never a toast or modal. Info/warning use
// role="status", error uses role="alert".
export default function Notice({
  level,
  children,
  action,
}: {
  level: NoticeLevel;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  const styles = {
    info: {
      box: "bg-[var(--color-accent-tint)] border-[var(--color-accent-tint-border)]",
      icon: "text-[var(--color-accent-text)]",
      text: "text-[var(--color-accent-text-soft)]",
      Icon: IconInfoCircle,
    },
    warning: {
      box: "bg-[var(--color-warn-tint)] border-[var(--color-warn-tint)]",
      icon: "text-[var(--color-warn)]",
      text: "text-[var(--color-warn)]",
      Icon: IconAlertTriangle,
    },
    error: {
      box: "bg-[var(--color-danger-tint)] border-[var(--color-danger-tint)]",
      icon: "text-[var(--color-danger)]",
      text: "text-[var(--color-danger)]",
      Icon: IconCircleX,
    },
  }[level];

  return (
    <div
      role={level === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-[var(--radius-9)] border ${styles.box}`}
    >
      <styles.Icon size={15} className={`mt-0.5 shrink-0 ${styles.icon}`} />
      <span className={`flex-1 text-[13px] leading-snug ${styles.text}`}>{children}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`shrink-0 text-[13px] font-medium ${styles.icon} hover:underline`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
