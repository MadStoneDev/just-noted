// src/utils/format-date.ts
// The app's one date format: "26 Nov 2026", and "26 Nov 2026, 3:45 pm" where
// the time matters. Lists may say "just now", "5m ago" or "3h ago" for the
// last 24 hours (formatWhen); anything older is the date.
//
// Built by hand rather than with toLocaleDateString: the browser's locale
// changed the order and month names ("Nov 26", "26/11/2026", "Sept"), which is
// what made dates differ across the app. Times are in the viewer's time zone.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type DateInput = Date | string | number;

function toDate(input: DateInput): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "26 Nov 2026". Empty string for an invalid date. */
export function formatDate(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "3:45 pm". */
export function formatTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "";
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h < 12 ? "am" : "pm"}`;
}

/** "26 Nov 2026, 3:45 pm". */
export function formatDateTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "";
  return `${formatDate(d)}, ${formatTime(d)}`;
}

/**
 * For list rows: "just now", "5m ago", "3h ago" within the last 24 hours,
 * otherwise the date ("26 Nov 2026"), with the time when `time` is set.
 */
export function formatWhen(input: DateInput, opts: { time?: boolean; now?: number } = {}): string {
  const d = toDate(input);
  if (!d) return "";
  const diff = (opts.now ?? Date.now()) - d.getTime();
  if (diff >= 0 && diff < 86_400_000) {
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }
  return opts.time ? formatDateTime(d) : formatDate(d);
}
