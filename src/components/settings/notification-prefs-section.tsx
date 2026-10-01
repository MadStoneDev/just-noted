"use client";

import React, { useEffect, useState } from "react";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_KEYS,
  prefForType,
  type ChannelPref,
} from "@/lib/notifications";
import { getUserSettings, updateNotificationPrefs } from "@/app/actions/userSettingsActions";

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
        on ? "bg-[var(--color-accent-fill)]" : "bg-[var(--color-raised-soft)] border border-[var(--color-hairline)]"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

export default function NotificationPrefsSection() {
  const [prefs, setPrefs] = useState<Record<string, ChannelPref>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserSettings().then((s) => { setPrefs(s.notifications); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const setInApp = async (type: string, on: boolean) => {
    const cur = prefForType(prefs, type as any);
    const next = { ...prefs, [type]: { ...cur, inApp: on ? ("instantly" as const) : ("off" as const) } };
    setPrefs(next);
    await updateNotificationPrefs(next);
  };

  if (loading) {
    return <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10 w-full rounded-[var(--radius-8)]" />)}</div>;
  }

  return (
    <div>
      <p className="text-[12.5px] text-[var(--color-ink-4)] leading-relaxed mb-4">
        Choose what shows up in your in-app notifications (the bell). Email notifications are coming later.
      </p>
      <ul className="divide-y divide-[var(--color-hairline-soft)]">
        {NOTIFICATION_TYPE_KEYS.map((type) => {
          const def = NOTIFICATION_TYPES[type];
          const on = prefForType(prefs, type).inApp !== "off";
          return (
            <li key={type} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--color-ink-1)]">{def.label}</p>
                <p className="text-[12px] text-[var(--color-ink-5)] leading-snug">{def.description}</p>
              </div>
              <Toggle on={on} onChange={(v) => setInApp(type, v)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
